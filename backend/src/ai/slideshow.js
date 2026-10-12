import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ffmpegPath from 'ffmpeg-static';
import { logger } from '../utils/logger.js';

/**
 * Builds a short Reels/Shorts-style MP4 from a few images: each image slowly zooms in, with its
 * caption at the bottom. Runs the ffmpeg binary that ships with the `ffmpeg-static` package, so
 * nothing has to be installed on the server. Free — no paid video API involved.
 */

const SIZES = { portrait: [1080, 1920], square: [1080, 1080], landscape: [1920, 1080] };
const FPS = 30;
const FFMPEG_TIMEOUT_MS = 3 * 60 * 1000; // a stuck encode is killed, never left hanging

// A bold font for captions. AI_VIDEO_FONT can point at any .ttf; otherwise the usual system places are tried.
// A font bundled with the app (npm package dejavu-fonts-ttf), so captions and graphic cards look the same
// on every server — including hosts without system fonts (Render, slim Docker images).
const require = createRequire(import.meta.url);
const BUNDLED_FONT = (() => {
  try {
    return path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf', 'DejaVuSans-Bold.ttf');
  } catch {
    return null;
  }
})();

const FONT_CANDIDATES = [
  process.env.AI_VIDEO_FONT,
  BUNDLED_FONT,
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', // Alpine (font-dejavu)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', // Debian / Ubuntu
  '/usr/share/fonts/noto/NotoSans-Bold.ttf',
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/Nirmala.ttf', // has Hindi too
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
].filter(Boolean);

// Hindi / Marathi captions need a Devanagari font, or they show as empty boxes.
const DEVANAGARI_FONT_CANDIDATES = [
  process.env.AI_VIDEO_FONT_DEVANAGARI,
  '/usr/share/fonts/noto/NotoSansDevanagari-Bold.ttf', // Alpine (font-noto-devanagari)
  '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf',
  'C:/Windows/Fonts/Nirmala.ttf',
].filter(Boolean);

export const findFont = (captions) => {
  const needsDevanagari = captions.some((caption) => /[\u0900-\u097F]/.test(caption ?? ''));
  const candidates = needsDevanagari ? [...DEVANAGARI_FONT_CANDIDATES, ...FONT_CANDIDATES] : FONT_CANDIDATES;
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

/** drawtext does not wrap lines itself, so break the caption into short lines (by words). */
export function wrapCaption(text, maxCharsPerLine) {
  const lines = [];
  let line = '';
  for (const word of String(text).replace(/\s+/g, ' ').trim().split(' ')) {
    if (line && (line + ' ' + word).length > maxCharsPerLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5).join('\n'); // at most 5 lines, so it never covers the whole picture
}

export function runFfmpeg(args, cwd) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg is not available on this server.'));
    const child = spawn(ffmpegPath, args, { cwd, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000); // keep only the end: that is where ffmpeg explains failures
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(signal === 'SIGKILL' ? 'Making the video took too long and was stopped.' : `ffmpeg failed: ${stderr.slice(-500)}`));
    });
  });
}

/**
 * @param slides  [{ buffer, contentType, caption }]  — 1 to 8 images
 * @param aspect  'portrait' | 'square' | 'landscape'
 * @returns { buffer, contentType: 'video/mp4', seconds }
 */
export async function makeSlideshow({ slides, aspect = 'portrait', secondsPerSlide = 3 }) {
  if (!slides.length) throw new Error('A slideshow needs at least one image.');
  const [width, height] = SIZES[aspect] ?? SIZES.portrait;
  const frames = Math.round(secondsPerSlide * FPS);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-slideshow-'));

  try {
    // Everything lives in workDir and ffmpeg runs there, so file names need no path escaping.
    const font = findFont(slides.map((slide) => slide.caption));
    if (font) await fs.copyFile(font, path.join(workDir, 'font.ttf'));
    else logger.warn('No caption font found — slideshow will have no burned-in captions. Set AI_VIDEO_FONT to a .ttf file.');

    const inputs = [];
    const chains = [];
    for (const [index, slide] of slides.entries()) {
      const extension = slide.contentType === 'image/jpeg' ? 'jpg' : slide.contentType === 'image/webp' ? 'webp' : 'png';
      await fs.writeFile(path.join(workDir, `slide${index}.${extension}`), slide.buffer);
      inputs.push('-i', `slide${index}.${extension}`);

      // Fill the frame (crop the overflow), then a slow zoom-in over the slide's duration.
      let chain =
        `[${index}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},` +
        `zoompan=z='min(zoom+0.0007,1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${FPS},setsar=1`;
      if (font && slide.caption) {
        await fs.writeFile(path.join(workDir, `caption${index}.txt`), wrapCaption(slide.caption, aspect === 'landscape' ? 40 : 24));
        const fontSize = Math.round(width / 18);
        chain +=
          // expansion=none: show the caption exactly as written ("50% off" would otherwise be read as a % code and vanish).
          `,drawtext=fontfile=font.ttf:textfile=caption${index}.txt:expansion=none:fontcolor=white:fontsize=${fontSize}:line_spacing=12:` +
          `box=1:boxcolor=black@0.55:boxborderw=28:x=(w-text_w)/2:y=h-text_h-${Math.round(height * 0.12)}`;
      }
      chains.push(`${chain},format=yuv420p[v${index}]`);
    }
    const concatInputs = slides.map((_, index) => `[v${index}]`).join('');
    const filter = `${chains.join(';')};${concatInputs}concat=n=${slides.length}:v=1:a=0[out]`;
    logger.debug('Slideshow ffmpeg filter', { filter, font: Boolean(font) });

    await runFfmpeg(
      ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', String(FPS), '-movflags', '+faststart', 'out.mp4'],
      workDir
    );
    const buffer = await fs.readFile(path.join(workDir, 'out.mp4'));
    return { buffer, contentType: 'video/mp4', seconds: slides.length * secondsPerSlide };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
