import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { findFont, runFfmpeg, wrapCaption } from '../slideshow.js';

/**
 * The free agent's "designer": a clean branded graphic card (PNG) with a headline, a short line and
 * the company name, in the brand colour. Made with the bundled ffmpeg — free, no image API needed.
 */

const SIZES = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920] };

/** "#4f46e5" → "0x4f46e5" (ffmpeg's colour format); anything invalid falls back to indigo. */
const ffmpegColor = (hex) => (/^#[0-9a-f]{6}$/i.test(hex ?? '') ? `0x${hex.slice(1)}` : '0x4f46e5');

/**
 * @returns { buffer, contentType: 'image/png' }
 */
export async function makeCard({ headline, body = '', footer = '', color = '#4f46e5', aspect = 'square' }) {
  const [width, height] = SIZES[aspect] ?? SIZES.square;
  const font = findFont([headline, body, footer]);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'social-card-'));
  try {
    // Text goes through files (textfile=) so nothing needs escaping; expansion=none keeps "%" as typed.
    const filters = [
      // a thin accent line above the headline, for a designed look
      `drawbox=x=${Math.round(width * 0.08)}:y=${Math.round(height * 0.3)}:w=${Math.round(width * 0.12)}:h=8:color=white@0.85:t=fill`,
    ];
    if (font) {
      await fs.copyFile(font, path.join(workDir, 'font.ttf'));
      await fs.writeFile(path.join(workDir, 'headline.txt'), wrapCaption(headline, 16));
      filters.push(
        `drawtext=fontfile=font.ttf:textfile=headline.txt:expansion=none:fontcolor=white:fontsize=${Math.round(width / 11)}:line_spacing=10:x=${Math.round(width * 0.08)}:y=${Math.round(height * 0.34)}`
      );
      if (body) {
        await fs.writeFile(path.join(workDir, 'body.txt'), wrapCaption(body, 30));
        filters.push(
          `drawtext=fontfile=font.ttf:textfile=body.txt:expansion=none:fontcolor=white@0.92:fontsize=${Math.round(width / 26)}:line_spacing=10:x=${Math.round(width * 0.08)}:y=${Math.round(height * 0.6)}`
        );
      }
      if (footer) {
        await fs.writeFile(path.join(workDir, 'footer.txt'), footer.slice(0, 60));
        filters.push(
          `drawtext=fontfile=font.ttf:textfile=footer.txt:expansion=none:fontcolor=white:fontsize=${Math.round(width / 28)}:x=${Math.round(width * 0.08)}:y=h-${Math.round(height * 0.1)}`
        );
      }
    }
    await runFfmpeg(
      ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${ffmpegColor(color)}:s=${width}x${height}`, '-vf', filters.join(','), '-frames:v', '1', 'card.png'],
      workDir
    );
    return { buffer: await fs.readFile(path.join(workDir, 'card.png')), contentType: 'image/png' };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
