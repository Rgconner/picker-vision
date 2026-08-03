/**
 * qrSvg — returns an inline SVG string encoding `text` at `px`×`px` pixels.
 *
 * Delegates to the `qrcode` npm package (battle-tested, zero hand-rolled math).
 * The previous hand-rolled implementation had two structural bugs:
 *   1. Wrong mask formula (floor(r/2+c/3) matches no QR spec pattern)
 *   2. DCAP/ECWDS table columns swapped (used EC-M counts for EC-L)
 * Both made every generated code undecodable. Replaced entirely.
 *
 * Usage:
 *   import { qrSvg } from './qrSvg';
 *   element.innerHTML = qrSvg('BTT-00101', 200);
 */

import QRCode from 'qrcode';

/**
 * Returns a synchronous SVG string. `qrcode` has a sync path via toCanvas/toString
 * but the cleanest sync API is toDataURL with type svg — however that's async.
 * We use the internal QRCode.create() sync method to get the module matrix and
 * render it ourselves as SVG, keeping the same call signature as before.
 */
export function qrSvg(text: string, px: number): string {
  // QRCode.create() is synchronous and returns the module matrix directly.
  const qr = QRCode.create(text, { errorCorrectionLevel: 'L' });
  const n    = qr.modules.size;
  const cell = px / n;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}">`,
    `<rect width="${px}" height="${px}" fill="#fff"/>`,
  ];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        parts.push(
          `<rect x="${(c * cell).toFixed(1)}" y="${(r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="#000"/>`,
        );
      }
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
