/**
 * dmSvg — self-contained Data Matrix ECC200 generator returning an SVG string.
 *
 * ISO/IEC 16022 · GF(256) with primitive polynomial 0x12D
 * Encoding: ASCII mode (handles all BTT/TOTE/STAGING payloads)
 * Symbol sizes: 10×10 through 24×24 square ECC200 symbols
 *
 * Usage:
 *   import { dmSvg } from './dmSvg';
 *   element.innerHTML = dmSvg('BTT-00101', 152);  // 152px ≈ 4 cm at 96 dpi
 */

// ── GF(256) tables — primitive polynomial x^8+x^5+x^3+x^2+1 = 0x12D ──────────
const GF_EXP: number[] = new Array(512);
const GF_LOG: number[] = new Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x12d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gmul(a: number, b: number): number {
  return a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0;
}

// ── Reed-Solomon ──────────────────────────────────────────────────────────────
function rsGenPoly(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const t = [1, GF_EXP[i]];
    const r = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++)
      for (let k = 0; k < t.length; k++) r[j + k] ^= gmul(g[j], t[k]);
    g = r;
  }
  return g;
}

function rsEncode(data: number[], ecCount: number): number[] {
  const g = rsGenPoly(ecCount);
  const msg = data.slice();
  for (let i = 0; i < ecCount; i++) msg.push(0);
  for (let i = 0; i < data.length; i++) {
    const c = msg[i];
    if (c) for (let j = 0; j < g.length; j++) msg[i + j] ^= gmul(g[j], c);
  }
  return msg.slice(data.length);
}

// ── Symbol parameters [rows, cols, datawords, ecwords] ───────────────────────
const PARAMS: [number, number, number, number][] = [
  [10, 10,  3,  5],
  [12, 12,  5,  7],
  [14, 14,  8, 10],
  [16, 16, 12, 12],
  [18, 18, 18, 14],
  [20, 20, 22, 18],
  [22, 22, 30, 20],
  [24, 24, 36, 24],
];

// ── ASCII encode ──────────────────────────────────────────────────────────────
function dmEncode(text: string): number[] {
  const cw: number[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c >= 48 && c <= 57 && i + 1 < text.length) {
      const c2 = text.charCodeAt(i + 1);
      if (c2 >= 48 && c2 <= 57) {
        cw.push((c - 48) * 10 + (c2 - 48) + 130);
        i += 2;
        continue;
      }
    }
    cw.push(c + 1);
    i++;
  }
  return cw;
}

function pickParams(cw: number[]): [number, number, number, number] {
  for (const p of PARAMS) if (cw.length <= p[2]) return p;
  return PARAMS[PARAMS.length - 1];
}

function padData(cw: number[], capacity: number): number[] {
  const out = cw.slice();
  if (out.length < capacity) out.push(129); // end-of-message
  while (out.length < capacity) {
    out.push((((149 * (out.length + 1)) % 253) + 130) % 254);
  }
  return out;
}

// ── ECC200 module placement ───────────────────────────────────────────────────
function buildMatrix(rows: number, cols: number, data: number[]): number[][] {
  const mat: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1));

  // Finder borders
  for (let i = 0; i < rows; i++) {
    mat[i][0]        = 1;
    mat[i][cols - 1] = i % 2 === 0 ? 1 : 0;
  }
  for (let j = 0; j < cols; j++) {
    mat[rows - 1][j] = 1;
    mat[0][j]        = j % 2 === 0 ? 1 : 0;
  }

  const used: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false));
  for (let i = 0; i < rows; i++) { used[i][0] = true; used[i][cols - 1] = true; }
  for (let j = 0; j < cols; j++) { used[0][j] = true; used[rows - 1][j] = true; }

  function sm(r: number, c: number, bit: number) {
    if (r < 0) r += rows;
    if (c < 0) c += cols;
    if (r < 0 || r >= rows || c < 0 || c >= cols || used[r][c]) return;
    used[r][c] = true;
    mat[r][c]  = bit;
  }

  function utah(r: number, c: number, b: number) {
    sm(r - 2, c - 2, (b >> 7) & 1); sm(r - 2, c - 1, (b >> 6) & 1);
    sm(r - 1, c - 2, (b >> 5) & 1); sm(r - 1, c - 1, (b >> 4) & 1);
    sm(r - 1, c,     (b >> 3) & 1); sm(r,     c - 2, (b >> 2) & 1);
    sm(r,     c - 1, (b >> 1) & 1); sm(r,     c,     (b >> 0) & 1);
  }

  function corner1(b: number) {
    sm(rows-1, 0,     (b>>7)&1); sm(rows-1, 1,     (b>>6)&1);
    sm(rows-1, 2,     (b>>5)&1); sm(0,      cols-2, (b>>4)&1);
    sm(0,      cols-1,(b>>3)&1); sm(1,      cols-1, (b>>2)&1);
    sm(2,      cols-1,(b>>1)&1); sm(3,      cols-1, (b>>0)&1);
  }
  function corner2(b: number) {
    sm(rows-3, 0,     (b>>7)&1); sm(rows-2, 0,     (b>>6)&1);
    sm(rows-1, 0,     (b>>5)&1); sm(0,      cols-4, (b>>4)&1);
    sm(0,      cols-3,(b>>3)&1); sm(0,      cols-2, (b>>2)&1);
    sm(0,      cols-1,(b>>1)&1); sm(1,      cols-1, (b>>0)&1);
  }
  function corner3(b: number) {
    sm(rows-3, 0,     (b>>7)&1); sm(rows-2, 0,     (b>>6)&1);
    sm(rows-1, 0,     (b>>5)&1); sm(0,      cols-2, (b>>4)&1);
    sm(0,      cols-1,(b>>3)&1); sm(1,      cols-1, (b>>2)&1);
    sm(2,      cols-1,(b>>1)&1); sm(3,      cols-1, (b>>0)&1);
  }
  function corner4(b: number) {
    sm(rows-1, 0,      (b>>7)&1); sm(rows-1, cols-1, (b>>6)&1);
    sm(0,      cols-3, (b>>5)&1); sm(0,      cols-2, (b>>4)&1);
    sm(0,      cols-1, (b>>3)&1); sm(1,      cols-3, (b>>2)&1);
    sm(1,      cols-2, (b>>1)&1); sm(1,      cols-1, (b>>0)&1);
  }

  let cwIdx = 0;
  const nb = () => cwIdx < data.length ? data[cwIdx++] : 0;

  let r = 4, c = 0;
  do {
    if (r === rows     && c === 0)                   corner1(nb());
    if (r === rows - 2 && c === 0 && cols % 4 !== 0) corner2(nb());
    if (r === rows - 2 && c === 0 && cols % 8 === 4) corner3(nb());
    if (r === rows + 4 && c === 2 && cols % 8 === 0) corner4(nb());
    do {
      if (r < rows && c >= 0 && !used[r][c]) utah(r, c, nb());
      r -= 2; c += 2;
    } while (r >= 0 && c < cols);
    r += 1; c += 3;
    do {
      if (r >= 0 && c < cols && !used[r][c]) utah(r, c, nb());
      r += 2; c -= 2;
    } while (r < rows && c >= 0);
    r += 3; c += 1;
  } while (r < rows || c < cols);

  // Fill any untouched interior cells
  for (let ri = 1; ri < rows - 1; ri++)
    for (let ci = 1; ci < cols - 1; ci++)
      if (mat[ri][ci] === -1) mat[ri][ci] = 0;

  return mat;
}

/**
 * Returns an SVG string encoding `text` as a Data Matrix ECC200 symbol
 * at `px`×`px` pixels. White background, black modules, pixelated rendering.
 */
export function dmSvg(text: string, px: number): string {
  const cw     = dmEncode(text);
  const par    = pickParams(cw);
  const [rows, cols, dcap, ecCount] = par;
  const padded = padData(cw, dcap);
  const ec     = rsEncode(padded, ecCount);
  const mat    = buildMatrix(rows, cols, padded.concat(ec));
  const cell   = px / rows;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}"`,
    ` width="${px}" height="${px}" style="image-rendering:pixelated">`,
    `<rect width="${px}" height="${px}" fill="#fff"/>`,
  ];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++)
      if (mat[row][col] === 1)
        parts.push(
          `<rect x="${(col * cell).toFixed(2)}" y="${(row * cell).toFixed(2)}"` +
          ` width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="#000"/>`,
        );
  parts.push('</svg>');
  return parts.join('');
}
