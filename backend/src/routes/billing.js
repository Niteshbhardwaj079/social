import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config/env.js';
import { authenticate, requireSettingsEditor, requireSettingsViewer } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { badRequest } from '../utils/httpError.js';
import * as billing from '../services/billingService.js';

/**
 * The customer's Billing page: current plan & usage, upgrade (pay), payments, invoices, history.
 * Seeing it needs Settings → View; paying or editing billing details needs Settings → Edit.
 */
const router = Router();
router.use(authenticate, requireSettingsViewer);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.billing.maxProofBytes, files: 1 } });

// multer reports "too large" by throwing inside its own middleware — turn that into a friendly message.
function optionalProof(req, res, next) {
  upload.single('proof')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return next(badRequest('The screenshot must be smaller than 5 MB.'));
    next(error);
  });
}

const idParams = z.object({ id: z.string().uuid() });
const planChoice = {
  planId: z.string().trim().min(1).max(40),
  billingCycle: z.enum(['monthly', 'yearly']),
};

router.get('/', async (_req, res) => res.json(await billing.getOverview()));
router.get('/plans', async (_req, res) => res.json({ plans: await billing.listAvailablePlans() }));
router.get('/payments', async (_req, res) => res.json({ payments: await billing.listPayments() }));
router.get('/invoices', async (_req, res) => res.json({ invoices: await billing.listInvoices() }));
router.get('/invoices/:id', validate({ params: idParams }), async (req, res) => res.json({ invoice: await billing.getInvoice(req.valid.params.id) }));
router.get('/history', async (_req, res) => res.json({ history: await billing.listHistory() }));

router.get('/payments/:id/proof', validate({ params: idParams }), async (req, res) => {
  const proof = await billing.getPaymentProof(req.valid.params.id);
  res.type(proof.contentType).sendFile(proof.filePath);
});

router.put(
  '/details',
  requireSettingsEditor,
  validate({
    body: z.object({
      name: z.string().trim().max(160),
      email: z.union([z.literal(''), z.string().trim().email().max(254)]),
      address: z.string().trim().max(500),
      gstin: z.string().trim().max(20),
    }),
  }),
  async (req, res) => res.json({ billingDetails: await billing.updateBillingDetails(req.valid.body) })
);

router.post(
  '/checkout',
  requireSettingsEditor,
  validate({ body: z.object({ ...planChoice, provider: z.string().max(40).default('manual') }) }),
  async (req, res) => res.json(await billing.startCheckout(req.valid.body))
);

// multipart/form-data: the fields below + an optional `proof` file (screenshot of the payment).
router.post(
  '/payments',
  requireSettingsEditor,
  optionalProof,
  validate({
    body: z.object({
      ...planChoice,
      transactionId: z.string().trim().min(4, 'Enter the transaction ID / UTR').max(100),
      method: z.enum(['upi', 'bank_transfer', 'card', 'cash', 'cheque', 'other']).default('upi'),
      payerName: z.string().trim().max(120).optional(),
      paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker').optional().or(z.literal('').transform(() => undefined)),
      note: z.string().trim().max(1000).optional(),
    }),
  }),
  async (req, res) => res.status(201).json({ payment: await billing.submitManualPayment(req.user, req.valid.body, req.file) })
);

export default router;
