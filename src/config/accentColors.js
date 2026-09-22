/**
 * Named accent colors used for icon badges, avatars and category tags across
 * cards (KPIs, roles, etc.) so a page reads as visually distinct rather than
 * a single brand color repeated everywhere. Each key maps to a CSS class
 * suffix — see .kpi-card__icon--{accent} and .role-icon--{accent}.
 */
export const ACCENT_COLORS = ['primary', 'rose', 'purple', 'teal', 'amber', 'blue', 'slate'];

export function getAccentColorByIndex(index) {
  return ACCENT_COLORS[index % ACCENT_COLORS.length];
}
