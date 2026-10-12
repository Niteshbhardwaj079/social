import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePlatformAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as billing from '../services/billingService.js';
import * as platform from '../services/platformService.js';
import { createPlan, deletePlan, listPlans, updatePlan } from '../services/planService.js';
import { getPlatformSettings, platformSettingsSchema, savePlatformSettings } from '../services/platformSettingsService.js';
import * as aiKeys from '../services/aiKeyService.js';
import { setOrganizationAiAccess } from '../services/aiAccessService.js';
import { AI_PROVIDER_KEYS, listAiProviders } from '../ai/providers/index.js';

/**
 * The platform owner's screens (you, running the SaaS): every organization, plans, payments to
 * approve, invoices and platform settings. Organization admins can never reach these.
 */
const router = Router();
router.use(authenticate, requirePlatformAdmin);

const idParams = z.object({ id: z.string().uuid() });
const reviewNote = z.object({ note: z.string().trim().max(1000).default('') });
const limit = z.number().int().min(0).max(1_000_000).nullable(); // null = unlimited

router.get('/overview', async (_req, res) => res.json(await platform.getPlatformStats()));

// ---------------------------------------------------------------- organizations
router.get('/organizations', async (_req, res) => res.json({ organizations: await platform.listOrganizations() }));
router.get('/organizations/:id', validate({ params: idParams }), async (req, res) => res.json(await platform.getOrganizationDetail(req.valid.params.id)));

router.patch(
  '/organizations/:id/status',
  validate({ params: idParams, body: z.object({ status: z.enum(['active', 'suspended']) }) }),
  async (req, res) => res.json(await platform.setOrganizationStatus(req.user, req.valid.params.id, req.valid.body.status))
);

router.post(
  '/organizations/:id/plan',
  validate({
    params: idParams,
    body: z.object({
      planId: z.string().trim().min(1).max(40),
      billingCycle: z.enum(['monthly', 'yearly']).nullable().default(null),
      periodEnd: z.string().datetime({ offset: true }).nullable().default(null), // null = never ends (or one cycle, with an invoice)
      note: z.string().trim().max(1000).default(''),
      // The customer paid outside the app: record the payment and issue the invoice now.
      createInvoice: z.boolean().default(false),
      amount: z.number().min(0).max(100_000_000).nullable().default(null), // total incl. tax; null = the plan price (with credit)
      method: z.enum(['upi', 'bank_transfer', 'card', 'cash', 'cheque', 'other']).default('bank_transfer'),
      reference: z.string().trim().max(100).default(''),
    }),
  }),
  async (req, res) => {
    const invoice = await billing.assignPlan(req.user, req.valid.params.id, req.valid.body);
    res.json({ ...(await platform.getOrganizationDetail(req.valid.params.id)), invoice });
  }
);

// What a plan change would cost right now (price − credit for unused days + tax), before the owner confirms.
router.get(
  '/organizations/:id/quote',
  validate({ params: idParams, query: z.object({ planId: z.string().min(1).max(40), billingCycle: z.enum(['monthly', 'yearly']) }) }),
  async (req, res) => res.json({ price: await billing.quoteForOrganization(req.valid.params.id, req.valid.query.planId, req.valid.query.billingCycle) })
);

// ---------------------------------------------------------------- payments
router.get(
  '/payments',
  validate({ query: z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }) }),
  async (req, res) => res.json({ payments: await billing.listAllPayments(req.valid.query) })
);

router.get('/payments/:id/proof', validate({ params: idParams }), async (req, res) => {
  const proof = await billing.getPaymentProofAnyOrganization(req.valid.params.id);
  res.type(proof.contentType).sendFile(proof.filePath);
});

router.post('/payments/:id/approve', validate({ params: idParams, body: reviewNote }), async (req, res) =>
  res.json({ invoice: await billing.approvePayment(req.user, req.valid.params.id, req.valid.body.note) })
);

router.post(
  '/payments/:id/reject',
  validate({ params: idParams, body: z.object({ note: z.string().trim().min(3, 'Tell the customer why').max(1000) }) }),
  async (req, res) => {
    await billing.rejectPayment(req.user, req.valid.params.id, req.valid.body.note);
    res.json({ success: true });
  }
);

// ---------------------------------------------------------------- invoices
router.get('/invoices', async (_req, res) => res.json({ invoices: await billing.listAllInvoices() }));
router.get('/invoices/:id', validate({ params: idParams }), async (req, res) =>
  res.json({ invoice: await billing.getInvoiceAnyOrganization(req.valid.params.id) })
);

const correctionReason = z.string().trim().min(3, 'Write a short reason').max(500);
router.post('/invoices/:id/void', validate({ params: idParams, body: z.object({ reason: correctionReason }) }), async (req, res) =>
  res.json({ invoice: await billing.voidInvoice(req.user, req.valid.params.id, req.valid.body.reason) })
);
router.post(
  '/invoices/:id/reissue',
  validate({
    params: idParams,
    body: z.object({ reason: correctionReason, total: z.number().min(0.01).max(100_000_000).nullable().default(null), notes: z.string().trim().max(500).default('') }),
  }),
  async (req, res) => res.json({ invoice: await billing.reissueInvoice(req.user, req.valid.params.id, req.valid.body) })
);

// ---------------------------------------------------------------- plans
router.get('/plans', async (_req, res) => res.json({ plans: await listPlans({ includeHidden: true }) }));

// The fields of a plan the owner can set (every field optional when editing; a new plan needs a name).
const planFields = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300),
  priceMonthly: z.number().min(0).max(10_000_000),
  priceYearly: z.number().min(0).max(100_000_000),
  currency: z.string().trim().length(3).toUpperCase(),
  limits: z.object({ socialAccounts: limit, users: limit, postsPerMonth: limit, storageMb: limit }).partial(),
  features: z
    .object({ analytics: z.boolean(), inbox: z.boolean(), recycling: z.boolean(), links: z.boolean(), ads: z.boolean(), ai: z.boolean(), aiVideo: z.boolean() })
    .partial(),
  aiCreditsPerMonth: limit,
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});
const planIdParams = z.object({ id: z.string().min(1).max(40) });

router.post('/plans', validate({ body: planFields.partial().required({ name: true }) }), async (req, res) =>
  res.status(201).json({ plan: await createPlan(req.valid.body) })
);
router.patch('/plans/:id', validate({ params: planIdParams, body: planFields.partial() }), async (req, res) =>
  res.json({ plan: await updatePlan(req.valid.params.id, req.valid.body) })
);
router.delete('/plans/:id', validate({ params: planIdParams }), async (req, res) => {
  await deletePlan(req.valid.params.id);
  res.json({ success: true });
});

// ---------------------------------------------------------------- AI (the platform's own keys + per-organization switch)
router.get('/ai', async (_req, res) => {
  const [platformKeys, settings] = await Promise.all([aiKeys.listPlatformKeys(), getPlatformSettings()]);
  res.json({
    providers: listAiProviders(),
    keys: platformKeys,
    settings: { aiEnabled: settings.aiEnabled, aiHiddenWhenDisabled: settings.aiHiddenWhenDisabled, aiModels: settings.aiModels, aiOllamaUrl: settings.aiOllamaUrl },
  });
});

const aiProviderParams = z.object({ provider: z.enum(AI_PROVIDER_KEYS) });
router.put('/ai/keys/:provider', validate({ params: aiProviderParams, body: z.object({ apiKey: z.string().trim().min(10).max(500) }) }), async (req, res) =>
  res.json({ keys: await aiKeys.savePlatformKey(req.valid.params.provider, req.valid.body.apiKey) })
);
router.delete('/ai/keys/:provider', validate({ params: aiProviderParams }), async (req, res) =>
  res.json({ keys: await aiKeys.removePlatformKey(req.valid.params.provider) })
);

router.patch(
  '/organizations/:id/ai',
  validate({ params: idParams, body: z.object({ aiAccess: z.enum(['enabled', 'disabled', 'hidden']) }) }),
  async (req, res) => {
    await setOrganizationAiAccess(req.valid.params.id, req.valid.body.aiAccess);
    res.json(await platform.getOrganizationDetail(req.valid.params.id));
  }
);

// ---------------------------------------------------------------- platform settings
router.get('/settings', async (_req, res) => res.json({ settings: await getPlatformSettings() }));
router.put('/settings', validate({ body: platformSettingsSchema }), async (req, res) =>
  res.json({ settings: await savePlatformSettings(req.valid.body) })
);

export default router;
