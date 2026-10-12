import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { findFont } from '../slideshow.js';
import { accentOf, rgba, shade } from './colors.js';

/**
 * The "Design" picture templates: a branded graphic card (logo, headline, call-to-action) composited
 * with @napi-rs/canvas — the same engine for the free agent (a procedural background, no AI needed) and
 * the paid path (a clean AI photo behind it, with crisp, reliably-spelled text drawn on top in code,
 * instead of asking an image model to render the words — which diffusion models routinely misspell).
 */

export const DESIGN_TEMPLATES = ['bold', 'photo', 'quote', 'promo'];

const SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], landscape: [1600, 900] };

// ---------------------------------------------------------------- fonts (shared with the slideshow captions)
const fontFamilyByPath = new Map();
function fontFamilyFor(texts) {
  const path = findFont(texts);
  if (!path) return 'sans-serif';
  if (!fontFamilyByPath.has(path)) {
    const family = `SocialDesign${fontFamilyByPath.size}`;
    try {
      GlobalFonts.registerFromPath(path, family);
      fontFamilyByPath.set(path, family);
    } catch {
      fontFamilyByPath.set(path, 'sans-serif');
    }
  }
  return fontFamilyByPath.get(path);
}

// ---------------------------------------------------------------- text layout
function wrapText(ctx, text, maxWidth, maxLines = 6) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[lines.length - 1] += '…';
  return lines;
}

function drawLines(ctx, lines, x, y, lineHeight, align = 'left') {
  ctx.textAlign = align;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

/**
 * Stacks text blocks upward from a fixed bottom edge, each sized by how many lines it actually wraps
 * to — so a short headline and a long one both end with their last line sitting at `bottomY`, and
 * nothing before it can ever collide with what comes after. Returns the Y where the stack starts (its
 * top edge), so the caller can size a scrim or a background band to exactly fit what got drawn.
 * `blocks`: [{ text, font, color, lineHeight, maxLines, align, gapBefore }], top to bottom.
 */
function stackFromBottom(ctx, { x, bottomY, maxWidth, blocks }) {
  const prepared = [];
  for (const block of blocks) {
    if (!block.text) continue;
    ctx.font = block.font;
    const lines = wrapText(ctx, block.text, maxWidth, block.maxLines ?? 6);
    prepared.push({ ...block, lines, height: lines.length * block.lineHeight });
  }
  const totalHeight = prepared.reduce((sum, block) => sum + block.height + (block.gapBefore ?? 0), 0);
  let y = bottomY - totalHeight;
  for (const block of prepared) {
    y += block.gapBefore ?? 0;
    ctx.font = block.font;
    ctx.fillStyle = block.color;
    drawLines(ctx, block.lines, x, y, block.lineHeight, block.align ?? 'left');
    y += block.height;
  }
  return bottomY - totalHeight;
}

// ---------------------------------------------------------------- background
/** A soft, designed-looking background made of brand-colour gradients and blurred blobs — no photo needed. */
function paintProceduralBackground(ctx, width, height, color, seed = 0) {
  const base = shade(color, -0.1);
  const deep = shade(color, -0.45);
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, rgba(base, 1));
  grad.addColorStop(1, rgba(deep, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const accent = accentOf(color);
  const blobs = [
    { x: width * 0.85, y: height * 0.15, r: width * 0.42 },
    { x: width * 0.1, y: height * 0.85, r: width * 0.38 },
    { x: width * 0.6, y: height * 0.75, r: width * 0.28 },
  ];
  blobs.forEach((blob, index) => {
    const cx = blob.x + Math.sin(seed + index) * width * 0.03;
    const cy = blob.y + Math.cos(seed + index) * height * 0.03;
    // Several translucent rings approximate a soft blur without a real blur filter.
    for (let ring = 6; ring >= 1; ring -= 1) {
      ctx.globalAlpha = 0.03;
      ctx.fillStyle = rgba(index % 2 === 0 ? accent : shade(color, 0.3), 1);
      ctx.beginPath();
      ctx.arc(cx, cy, (blob.r / 6) * ring, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  // A faint dot grid for texture.
  ctx.fillStyle = rgba(shade(color, 0.6), 0.08);
  const step = Math.round(width / 28);
  for (let x = step / 2; x < width; x += step) {
    for (let y = step / 2; y < height; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function paintPhotoBackground(ctx, width, height, buffer) {
  const image = await loadImage(buffer);
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function paintScrim(ctx, x, y, w, h, direction = 'up') {
  const grad = direction === 'up' ? ctx.createLinearGradient(0, y + h, 0, y) : ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, 'rgba(10, 10, 20, 0)');
  grad.addColorStop(1, 'rgba(10, 10, 20, 0.82)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- logo + CTA chrome
async function drawLogoChip(ctx, logoBuffer, x, y, size, { circle = false } = {}) {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.beginPath();
  if (circle) ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  else ctx.roundRect(x, y, size, size, size * 0.22);
  ctx.fill();
  if (logoBuffer) {
    try {
      const logo = await loadImage(logoBuffer);
      const pad = size * 0.16;
      const inner = size - pad * 2;
      const scale = Math.min(inner / logo.width, inner / logo.height);
      const w = logo.width * scale;
      const h = logo.height * scale;
      ctx.save();
      ctx.beginPath();
      if (circle) ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      else ctx.roundRect(x, y, size, size, size * 0.22);
      ctx.clip();
      ctx.drawImage(logo, x + (size - w) / 2, y + (size - h) / 2, w, h);
      ctx.restore();
    } catch {
      // A broken logo file never blocks the card — the chip just stays blank.
    }
  }
  ctx.restore();
}

/** `anchorX` is the pill's left edge when `align: 'left'`, or its centre when `align: 'center'`. */
function drawCtaPill(ctx, text, anchorX, centerY, { fontFamily, fontSize, bg, fg, align = 'left' }) {
  if (!text) return null;
  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  const padX = fontSize * 0.9;
  const textWidth = ctx.measureText(text).width;
  const w = textWidth + padX * 2;
  const h = fontSize * 2.1;
  const left = align === 'center' ? anchorX - w / 2 : anchorX;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, centerY - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + w / 2, centerY + fontSize * 0.04);
  ctx.textBaseline = 'alphabetic';
  return { left, width: w, height: h };
}

// ---------------------------------------------------------------- the templates
async function drawBold(ctx, { width, height, headline, body, footer, color, logoBuffer, photoBuffer, seed, fontFamily }) {
  if (photoBuffer) await paintPhotoBackground(ctx, width, height, photoBuffer);
  else paintProceduralBackground(ctx, width, height, color, seed);

  const scale = Math.min(width, height); // font sizes track the shorter side, so a wide landscape card never runs out of vertical room
  const margin = width * 0.08;
  const maxWidth = width - margin * 2;
  const bottomY = height - margin * (footer ? 1.3 : 0.75);
  const blocks = [
    { text: headline, font: `800 ${Math.round(scale / 11)}px ${fontFamily}`, color: '#ffffff', lineHeight: scale / 10, maxLines: 3 },
    { text: body, font: `500 ${Math.round(scale / 26)}px ${fontFamily}`, color: 'rgba(255,255,255,0.9)', lineHeight: scale / 22, maxLines: 2, gapBefore: scale / 45 },
    { text: footer, font: `600 ${Math.round(scale / 32)}px ${fontFamily}`, color: 'rgba(255,255,255,0.78)', lineHeight: scale / 28, maxLines: 1, gapBefore: scale / 30 },
  ];
  const topY = stackFromBottom(ctx, { x: margin, bottomY, maxWidth, blocks });

  if (photoBuffer) {
    paintScrim(ctx, 0, Math.max(0, topY - margin), width, height - Math.max(0, topY - margin), 'up');
    // Re-draw the text: the scrim above would otherwise sit on top of it (scrim is painted after, for a photo bg).
    stackFromBottom(ctx, { x: margin, bottomY, maxWidth, blocks });
  }

  const accentY = Math.max(margin * 1.2, topY - scale / 9);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(margin, accentY, width * 0.1, height * 0.007);

  if (logoBuffer) await drawLogoChip(ctx, logoBuffer, margin, margin, Math.min(width * 0.11, scale * 0.16));
}

async function drawPhoto(ctx, { width, height, headline, body, cta, footer, color, logoBuffer, photoBuffer, seed, fontFamily }) {
  if (photoBuffer) await paintPhotoBackground(ctx, width, height, photoBuffer);
  else paintProceduralBackground(ctx, width, height, color, seed);

  const scale = Math.min(width, height);
  const margin = width * 0.08;
  const maxWidth = width - margin * 2;
  const pillFontSize = scale / 30;
  const chromeHeight = cta ? pillFontSize * 2.1 + scale / 30 : footer ? scale / 24 + scale / 30 : 0;
  const bottomY = height - margin - chromeHeight;
  const textBlocks = [
    { text: headline, font: `800 ${Math.round(scale / 12)}px ${fontFamily}`, color: '#ffffff', lineHeight: scale / 11, maxLines: 3 },
    { text: body, font: `500 ${Math.round(scale / 28)}px ${fontFamily}`, color: 'rgba(255,255,255,0.9)', lineHeight: scale / 24, maxLines: 2, gapBefore: scale / 55 },
  ];
  const topY = stackFromBottom(ctx, { x: margin, bottomY, maxWidth, blocks: textBlocks });
  paintScrim(ctx, 0, Math.max(0, topY - margin), width, height - Math.max(0, topY - margin), 'up');
  stackFromBottom(ctx, { x: margin, bottomY, maxWidth, blocks: textBlocks });

  if (logoBuffer) await drawLogoChip(ctx, logoBuffer, width - margin - scale * 0.11, margin, scale * 0.11, { circle: true });
  if (cta) {
    drawCtaPill(ctx, cta, margin, height - margin - pillFontSize * 1.05, { fontFamily, fontSize: pillFontSize, bg: '#ffffff', fg: rgba(shade(color, -0.1), 1), align: 'left' });
  } else if (footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `600 ${Math.round(scale / 34)}px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(footer, margin, height - margin);
  }
}

async function drawQuote(ctx, { width, height, headline, footer, color, logoBuffer, seed, fontFamily }) {
  paintProceduralBackground(ctx, width, height, color, seed);
  const margin = width * 0.12;

  const scale = Math.min(width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = `800 ${Math.round(scale / 4.2)}px Georgia, ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.fillText('“', margin - width * 0.015, height * 0.33);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(scale / 13)}px ${fontFamily}`;
  const lines = wrapText(ctx, headline, width - margin * 2, 5);
  const lineHeight = scale / 11.5;
  const startY = height / 2 - (lines.length * lineHeight) / 2;
  drawLines(ctx, lines, margin, startY, lineHeight, 'left');

  if (footer || logoBuffer) {
    const footerY = height - height * 0.14;
    let x = margin;
    if (logoBuffer) {
      await drawLogoChip(ctx, logoBuffer, x, footerY - scale * 0.045, scale * 0.09, { circle: true });
      x += scale * 0.09 + width * 0.03;
    }
    if (footer) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${Math.round(scale / 30)}px ${fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(footer, x, footerY);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

async function drawPromo(ctx, { width, height, headline, body, cta, footer, color, logoBuffer, photoBuffer, seed, fontFamily }) {
  const scale = Math.min(width, height);
  const margin = width * 0.08;
  const maxWidth = width - margin * 2 - (logoBuffer ? scale * 0.14 : 0);
  const headlineFont = `800 ${Math.round(scale / 13)}px ${fontFamily}`;
  const bodyFont = `500 ${Math.round(scale / 30)}px ${fontFamily}`;
  const headlineLineHeight = scale / 12;
  const bodyLineHeight = scale / 24;

  // The band's height is decided by how much text it must hold, so long copy never spills past it.
  ctx.font = headlineFont;
  const headlineLines = wrapText(ctx, headline, maxWidth, 3);
  const bodyLines = body ? (() => { ctx.font = bodyFont; return wrapText(ctx, body, width - margin * 2, 2); })() : [];
  const logoRow = logoBuffer ? scale * 0.1 + margin * 0.3 : 0;
  const pillFontSize = scale / 28;
  const pillReserve = cta ? pillFontSize * 2.1 * 0.6 + scale / 45 : 0; // half the pill straddles the band's bottom edge
  const contentHeight =
    logoRow + headlineLines.length * headlineLineHeight + (bodyLines.length ? scale / 45 + bodyLines.length * bodyLineHeight : 0) + pillReserve;
  const bandHeight = Math.min(height * 0.68, Math.max(height * 0.3, margin * 1.6 + contentHeight));

  const bandGrad = ctx.createLinearGradient(0, 0, width, bandHeight);
  bandGrad.addColorStop(0, rgba(shade(color, -0.05), 1));
  bandGrad.addColorStop(1, rgba(shade(color, -0.3), 1));
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 0, width, bandHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandHeight, width, height - bandHeight);
  ctx.clip();
  if (photoBuffer) await paintPhotoBackground(ctx, width, height, photoBuffer);
  else paintProceduralBackground(ctx, width, height, color, seed + 2);
  ctx.restore();
  paintScrim(ctx, 0, height - (height - bandHeight) * 0.42, width, (height - bandHeight) * 0.42, 'up');

  if (logoBuffer) await drawLogoChip(ctx, logoBuffer, margin, margin * 0.7, scale * 0.1);

  const textTop = margin * 0.8 + logoRow;
  ctx.fillStyle = '#ffffff';
  ctx.font = headlineFont;
  let y = drawLines(ctx, headlineLines, margin, textTop + headlineLineHeight * 0.78, headlineLineHeight, 'left');

  if (bodyLines.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = bodyFont;
    y = drawLines(ctx, bodyLines, margin, y + scale / 45, bodyLineHeight, 'left');
  }

  // CTA pill floats on the seam between the colour band and the photo/pattern below it.
  if (cta) drawCtaPill(ctx, cta, width / 2, bandHeight, { fontFamily, fontSize: pillFontSize, bg: '#ffffff', fg: rgba(shade(color, -0.1), 1), align: 'center' });

  if (footer) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${Math.round(scale / 32)}px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(footer, margin, height - margin * 0.5);
  }
}

const RENDERERS = { bold: drawBold, photo: drawPhoto, quote: drawQuote, promo: drawPromo };

/**
 * Renders one branded post graphic. `photoBuffer` is optional — paid AI passes a clean photo (no text
 * baked in); the free agent and the "no photo" choice fall back to a procedural brand-colour background,
 * so every template looks designed either way.
 * @returns {{ buffer: Buffer, contentType: 'image/png' }}
 */
export async function renderDesignCard({
  template = 'bold',
  headline = '',
  body = '',
  cta = '',
  footer = '',
  color = '#4f46e5',
  aspect = 'square',
  logoBuffer = null,
  photoBuffer = null,
  seed = 0,
}) {
  const [width, height] = SIZES[aspect] ?? SIZES.square;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const fontFamily = fontFamilyFor([headline, body, cta, footer]);
  const draw = RENDERERS[template] ?? RENDERERS.bold;
  await draw(ctx, { width, height, headline, body, cta, footer, color, logoBuffer, photoBuffer, seed, fontFamily });
  return { buffer: canvas.toBuffer('image/png'), contentType: 'image/png' };
}
