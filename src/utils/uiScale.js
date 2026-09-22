// Everything in the app is sized in rem, and the root font-size grows on big
// screens (see styles/base/_root.scss). Things that are measured in plain pixels
// — chart heights, axis text, icon sizes given as numbers — go through here so they
// grow with it and keep their proportions.

// The root size the design was drawn at: 1rem = 10.6px.
export const BASE_ROOT_PX = 10.6;

export function getUiScale() {
  if (typeof window === 'undefined') return 1;
  const rootPx = parseFloat(window.getComputedStyle(document.documentElement).fontSize);
  return rootPx && !Number.isNaN(rootPx) ? rootPx / BASE_ROOT_PX : 1;
}

// A pixel value drawn for the base design, converted to rem so it scales with the root.
export function pxToRem(px) {
  return `${(px / BASE_ROOT_PX).toFixed(4)}rem`;
}
