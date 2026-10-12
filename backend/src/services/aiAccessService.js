import { currentOrganizationId, query, runAsSystem } from '../db/pool.js';
import { getPlatformSettings } from './platformSettingsService.js';
import { getEffectivePlanRow } from './planService.js';
import { canManageAutopilots, canUseAi } from './permissions.js';
import { forbidden, planLimit } from '../utils/httpError.js';

/**
 * May this person use AI right now? Four switches, checked in this order — all must say yes:
 *   1. the platform owner's global switch (Platform → AI)
 *   2. the platform owner's switch for this organization (enabled / disabled / hidden)
 *   3. the organization's plan — only for PAID AI (feature_ai) and AI video (feature_ai_video); without
 *      them the built-in free agent still works, so every plan has the AI Studio
 *   4. the person's role (AI permission under Users & Roles)
 * "visible" decides whether the AI menu shows at all; "available" whether it works.
 */

/** Credits each kind of job costs when it runs on the PLATFORM's key. An organization's own key costs nothing. */
export const AI_CREDIT_COST = { text: 1, image: 5, slideshow: 10, video: 50, research: 20 };

async function organizationAiAccess() {
  // Read the organization BEFORE switching to the system context — inside it there is no current organization.
  const organizationId = currentOrganizationId();
  const row = (await runAsSystem(() => query('SELECT ai_access FROM organizations WHERE id = $1', [organizationId]))).rows[0];
  return row?.ai_access ?? 'enabled';
}

/** Platform-key credits used this calendar month by the current organization. */
export async function creditsUsedThisMonth() {
  const result = await query(
    `SELECT COALESCE(SUM(credits), 0) AS used FROM ai_generations
      WHERE uses_platform_key AND status <> 'failed' AND created_at >= date_trunc('month', now())`
  );
  return Number(result.rows[0].used);
}

/** Everything the web app needs to show (or hide, or lock) the AI Studio for this person. */
export async function getAiAccess(actor) {
  const [platform, orgAccess, plan, used] = await Promise.all([getPlatformSettings(), organizationAiAccess(), getEffectivePlanRow(), creditsUsedThisMonth()]);

  let available = true;
  let visible = true;
  let reason = null;
  // A short code the web app translates (reason stays the English text for API callers).
  let reasonCode = null;
  if (!platform.aiEnabled) {
    available = false;
    visible = !platform.aiHiddenWhenDisabled;
    reason = 'AI is switched off on this platform right now.';
    reasonCode = 'platformOff';
  } else if (orgAccess !== 'enabled') {
    available = false;
    visible = orgAccess !== 'hidden';
    reason = 'AI is switched off for your workspace. Please contact support.';
    reasonCode = 'workspaceOff';
  } else if (!canUseAi(actor)) {
    available = false;
    reason = 'Your role does not include AI. Ask an admin to turn on the AI permission for your role.';
    reasonCode = 'role';
  }

  const limit = plan.ai_credits_per_month === null ? null : Number(plan.ai_credits_per_month);
  return {
    visible,
    available,
    reason,
    reasonCode,
    // `available` = the agent works (the FREE agent at least). `paidAi` = the plan also includes paid AI
    // (Claude / OpenAI / Gemini); without it everything is done by the free agent.
    paidAi: available && plan.feature_ai === true,
    videoAvailable: available && plan.feature_ai === true && plan.feature_ai_video === true,
    canManageAutopilots: available && canManageAutopilots(actor),
    credits: { used, limit, costs: AI_CREDIT_COST },
  };
}

/** Throws a clear 403 unless this person may use AI (and paid AI video, when `kind` is 'video'). */
export async function assertAiAvailable(actor, kind = 'text') {
  const access = await getAiAccess(actor);
  if (!access.available) throw forbidden(access.reason);
  if (kind === 'video' && !access.videoAvailable) throw planLimit('AI video is not included in your plan. Upgrade under Billing, or make a slideshow video instead.', { feature: 'aiVideo' });
  return access;
}

/** Before a job on the platform's key: refuses if it would go over the plan's monthly credits. */
export async function assertCreditsAvailable(cost) {
  const plan = await getEffectivePlanRow();
  if (plan.ai_credits_per_month === null) return; // unlimited
  const used = await creditsUsedThisMonth();
  const limit = Number(plan.ai_credits_per_month);
  if (used + cost > limit) {
    throw planLimit(
      `This needs ${cost} AI credits, but only ${Math.max(0, limit - used)} of your ${limit} monthly credits are left. Upgrade your plan, or connect your own AI key under Settings → AI (no credits needed).`,
      { limit: 'aiCredits', max: limit, used }
    );
  }
}

/** Platform owner: switch AI on / off / hide for one organization. */
export async function setOrganizationAiAccess(organizationId, aiAccess) {
  await runAsSystem(() => query('UPDATE organizations SET ai_access = $2, updated_at = now() WHERE id = $1', [organizationId, aiAccess]));
}
