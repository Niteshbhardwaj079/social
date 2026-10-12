/** Small colour helpers for the design templates — no dependency, just hex/HSL maths. */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  const value = match ? match[1] : '4f46e5';
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}

export function rgba({ r, g, b }, alpha = 1) {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Mixes a colour toward black (amount < 0) or white (amount > 0), each in [-1, 1]. */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (channel) => clamp(Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount)), 0, 255);
  return { r: mix(r), g: mix(g), b: mix(b) };
}

/** How dark a colour reads, 0 (black) to 1 (white) — picks readable text colour for a background. */
export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** White text on a dark/mid background, near-black text on a pale one. */
export function readableTextColor(hex) {
  return relativeLuminance(hex) > 0.6 ? '#1a1a2e' : '#ffffff';
}

/** A pleasant accent colour: the brand hue, rotated, for the second colour in a gradient or blob. */
export function accentOf(hex) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2 / 255;
  const d = (max - min) / 255;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / 255 / d) % 6;
    else if (max === g) h = (b - r) / 255 / d + 2;
    else h = (r - g) / 255 / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const h2 = (h + 35) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * Math.max(s, 0.55);
  const x = c * (1 - Math.abs(((h2 / 60) % 2) - 1));
  const m = l - c / 2;
  let [r2, g2, b2] = [0, 0, 0];
  if (h2 < 60) [r2, g2, b2] = [c, x, 0];
  else if (h2 < 120) [r2, g2, b2] = [x, c, 0];
  else if (h2 < 180) [r2, g2, b2] = [0, c, x];
  else if (h2 < 240) [r2, g2, b2] = [0, x, c];
  else if (h2 < 300) [r2, g2, b2] = [x, 0, c];
  else [r2, g2, b2] = [c, 0, x];
  return { r: Math.round((r2 + m) * 255), g: Math.round((g2 + m) * 255), b: Math.round((b2 + m) * 255) };
}
