// `labelKey` maps to `recycling.intervals.<labelKey>` — look it up with `t()` at render time,
// never read `label` directly (kept only as an English fallback for non-component call sites).
const RECYCLE_INTERVALS = [
  { value: 14, label: 'Every 2 weeks', labelKey: 'days14' },
  { value: 30, label: 'Every 30 days', labelKey: 'days30' },
  { value: 60, label: 'Every 60 days', labelKey: 'days60' },
  { value: 90, label: 'Every 90 days', labelKey: 'days90' },
];

export default RECYCLE_INTERVALS;
