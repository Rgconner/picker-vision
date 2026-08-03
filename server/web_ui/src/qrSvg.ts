/**
 * qrSvg — self-contained QR code generator returning an SVG string.
 *
 * Ported from the vanilla-JS engine in btt-print-labels.html.
 * Supports text up to ~32 bytes (QR version 1–4, error correction M).
 *
 * Usage:
 *   import { qrSvg } from './qrSvg';
 *   element.innerHTML = qrSvg('BTT-00101', 200);
 */

// ── GF(256) tables ────────────────────────────────────────────────────────────
const EXP: number[] = new Array(256);
const LOG: number[] = new Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 256; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x *= 2;
    if (x >= 256) x ^= 285;
  }
})();

function gm(a: number, b: number): number {
  return a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
}

function rsGen(n: number): number[] {
  let p = [1];
  for (let i = 0; i < n; i++) {
    const t = [1, EXP[i]];
    const r = new Array(p.length + t.length - 1).fill(0);
    for (let j = 0; j < p.length; j++)
      for (let k = 0; k < t.length; k++) r[j + k] ^= gm(p[j], t[k]);
    p = r;
  }
  return p;
}

function rsEnc(d: number[], n: number): number[] {
  const g = rsGen(n);
  const m = d.concat(new Array(n).fill(0));
  for (let i = 0; i < d.length; i++) {
    const c = m[i];
    if (c) for (let j = 0; j < g.length; j++) m[i + j] ^= gm(g[j], c);
  }
  return m.slice(d.length);
}

// ── QR tables (versions 1–4, EC level L) ─────────────────────────────────────
// EC-L gives more data capacity (v4=78 bytes) vs EC-M (v4=62 bytes).
// The Join Demo URL is ~68 bytes — EC-L is required to encode a full https URL.
const DCAP  = [[17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34]];
const ECWDS = [[10,7,13,17],[10,10,22,28],[15,15,18,22],[20,20,26,16]];
const ALIGN = [[] as number[],[],[6,18],[6,22]];
// Format string for EC level L, mask pattern 2 (same mask as before)
const FMT_M = [0x77C4,0x72F3,0x7DAA,0x789D,0x662F,0x6318,0x6C41,0x6976];

function makeQR(text: string): { mat: number[][]; size: number } {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    bytes.push(c > 127 ? 63 : c);
  }

  // Use EC-L column (index 0) for maximum data capacity
  let ver = 1;
  for (let v = 1; v <= 4; v++) {
    if (bytes.length <= DCAP[v - 1][0]) { ver = v; break; }
  }

  const sz      = ver * 4 + 17;
  const totalDC = DCAP[ver - 1][0];
  const ecCnt   = ECWDS[ver - 1][0];

  // Encode bits
  const bits: number[] = [];
  bits.push(0, 1, 0, 0);
  for (let i = 7; i >= 0; i--) bits.push((bytes.length >> i) & 1);
  for (let i = 0; i < bytes.length; i++)
    for (let j = 7; j >= 0; j--) bits.push((bytes[i] >> j) & 1);
  for (let i = 0; i < 4 && bits.length < totalDC * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const pb = [0xEC, 0x11]; let pi = 0;
  while (bits.length < totalDC * 8) {
    for (let j = 7; j >= 0; j--) bits.push((pb[pi % 2] >> j) & 1);
    pi++;
  }

  const dc: number[] = [];
  for (let i = 0; i < totalDC; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    dc.push(b);
  }
  const ec  = rsEnc(dc, ecCnt);
  const all = dc.concat(ec);
  const ab: number[] = [];
  for (let i = 0; i < all.length; i++)
    for (let j = 7; j >= 0; j--) ab.push((all[i] >> j) & 1);
  const rem = [0, 7, 7, 7];
  for (let i = 0; i < rem[ver - 1]; i++) ab.push(0);

  // Matrix
  const mat: number[][] = [];
  const res: boolean[][] = [];
  for (let i = 0; i < sz; i++) {
    mat.push(new Array(sz).fill(-1));
    res.push(new Array(sz).fill(false));
  }

  const sm = (r: number, c: number, v: number) => { mat[r][c] = v; res[r][c] = true; };

  const finder = (tr: number, tc: number) => {
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++)
        sm(tr + r, tc + c,
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0);
  };
  finder(0, 0); finder(0, sz - 7); finder(sz - 7, 0);

  for (let i = 0; i < 8; i++) {
    sm(7, i, 0); sm(i, 7, 0);
    sm(7, sz - 8 + i, 0); sm(i, sz - 8, 0);
    sm(sz - 8, i, 0); sm(sz - 8 + i, 7, 0);
  }
  for (let i = 0; i <= 8; i++) { res[8][i] = true; res[i][8] = true; }
  res[8][sz - 8] = true;
  for (let i = sz - 7; i < sz; i++) { res[8][i] = true; res[i][8] = true; }
  mat[sz - 8][8] = 1;

  for (let i = 8; i < sz - 8; i++) {
    if (!res[6][i]) sm(6, i, i % 2 ? 0 : 1);
    if (!res[i][6]) sm(i, 6, i % 2 ? 0 : 1);
  }

  if (ver >= 2) {
    const ap = ALIGN[ver - 1];
    for (let ai = 0; ai < ap.length; ai++)
      for (let aj = 0; aj < ap.length; aj++) {
        const ar = ap[ai], ac = ap[aj];
        if (res[ar][ac]) continue;
        for (let r = -2; r <= 2; r++)
          for (let c = -2; c <= 2; c++)
            sm(ar + r, ac + c, (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) ? 1 : 0);
      }
  }

  let bi = 0, up = true, col = sz - 1;
  while (col > 0) {
    if (col === 6) col--;
    for (let d = 0; d < sz; d++) {
      const row = up ? (sz - 1 - d) : d;
      for (let dc2 = 0; dc2 <= 1; dc2++) {
        const cc = col - dc2;
        if (!res[row][cc]) mat[row][cc] = bi < ab.length ? ab[bi++] : 0;
      }
    }
    up = !up; col -= 2;
  }

  // Mask pattern 2: c % 3 === 0  (QR spec table, mask id 2)
  // Previous expression Math.floor(r/2 + c/3) is NOT equivalent to Math.floor(r/2) + Math.floor(c/3)
  // and matches none of the 8 standard patterns — corrupted data modules, decoders cannot invert.
  for (let r = 0; r < sz; r++)
    for (let c = 0; c < sz; c++)
      if (!res[r][c] && mat[r][c] !== -1 && (c % 3 === 0))
        mat[r][c] ^= 1;

  const fi = FMT_M[2];
  const fb: number[] = [];
  for (let i = 14; i >= 0; i--) fb.push((fi >> i) & 1);
  const fp = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  for (let i = 0; i < 15; i++) mat[fp[i][0]][fp[i][1]] = fb[i];
  for (let i = 0; i < 7; i++) mat[sz - 1 - i][8] = fb[i];
  mat[sz - 8][8] = 1;
  for (let i = 7; i < 15; i++) mat[8][sz - 15 + i] = fb[i];

  return { mat, size: sz };
}

/**
 * Returns an SVG string encoding `text` at `px`×`px` pixels.
 * The SVG has a white background and black modules.
 */
export function qrSvg(text: string, px: number): string {
  const { mat, size: n } = makeQR(text);
  const cell = px / n;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}">`,
    `<rect width="${px}" height="${px}" fill="#fff"/>`,
  ];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (mat[r][c] === 1)
        parts.push(
          `<rect x="${(c * cell).toFixed(1)}" y="${(r * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="#000"/>`,
        );
  parts.push('</svg>');
  return parts.join('');
}
