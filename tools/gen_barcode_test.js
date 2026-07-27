// Generates barcode_test.html — Code-128B size test sheet
const fs = require('fs');
const path = require('path');

const PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '211133','211331','213113','213311','213131','311123','311321','331121','312113','312311',
  '332111','314111','221411','431111','111224','111422','121124','121421','141122','141221',
  '112214','112412','122114','122411','142112','142211','241211','221114','413111','241112',
  '134111','111242','121142','121241','114212','124112','124211','411212','421112','421211',
  '212141','214121','412121','111143','111341','131141','114113','114311','411113','411311',
  '113141','114131','311141','411131','211412','211214','211232','2331112'
];

function barSVG(text, H, mod, quiet) {
  const vals = [104]; // START B
  let check = 104;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) - 32;
    vals.push(c);
    check += c * (i + 1);
  }
  vals.push(check % 103);
  vals.push(106); // STOP

  const widths = [];
  for (const v of vals) for (const ch of PATTERNS[v]) widths.push(+ch);

  const totalMod = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  const W = totalMod * mod;
  let x = quiet * mod;
  let isBar = true;
  const rects = [];
  for (const w of widths) {
    if (isBar) rects.push(`<rect x="${x}" y="0" width="${w * mod}" height="${H}" fill="#000"/>`);
    x += w * mod;
    isBar = !isBar;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${rects.join('')}</svg>`;
}

const sizes = [
  [80, 3, 'Row 1 &mdash; 80px tall, 3px/module'],
  [60, 2, 'Row 2 &mdash; 60px tall, 2px/module'],
  [48, 2, 'Row 3 &mdash; 48px tall, 2px/module'],
  [36, 2, 'Row 4 &mdash; 36px tall, 2px/module'],
  [28, 2, 'Row 5 &mdash; 28px tall, 2px/module'],
  [24, 1, 'Row 6 &mdash; 24px tall, 1px/module'],
  [20, 1, 'Row 7 &mdash; 20px tall, 1px/module'],
  [16, 1, 'Row 8 &mdash; 16px tall, 1px/module'],
  [12, 1, 'Row 9 &mdash; 12px tall, 1px/module'],
  [ 8, 1, 'Row 10 &mdash; 8px tall, 1px/module'],
];

const values = ['90210', '10001', '60614'];

let rows = '';
for (const [H, mod, tag] of sizes) {
  let cells = '';
  for (const v of values) {
    cells += `<td style="padding:3px 16px 6px 0;vertical-align:bottom">${barSVG(v, H, mod, 8)}<br><span style="font-size:8px;font-family:monospace;letter-spacing:1px">${v}</span></td>`;
  }
  rows += `<tr style="border-bottom:1px solid #eee"><td style="font-size:9px;color:#444;white-space:nowrap;padding-right:14px;vertical-align:middle">${tag}</td>${cells}</tr>`;
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Code-128 Size Test</title>
<style>
  body { margin: 14px; font-family: Arial, sans-serif; background: #fff; color: #000; }
  table { border-collapse: collapse; }
  h2 { font-size: 13px; margin: 0 0 4px; }
  .sub { font-size: 10px; color: #666; margin: 0 0 10px; }
  .footer { font-size: 9px; color: #aaa; margin-top: 14px; padding-top: 6px; border-top: 1px solid #eee; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
<h2>Code-128 Size Test &mdash; Picker Vision BTT</h2>
<p class="sub">Print this page &middot; scan each row with the phone camera &middot; mark the smallest row that reads reliably</p>
<table>${rows}</table>
<p class="noprint" style="margin-top:12px"><button onclick="window.print()">&#128438; Print this page</button></p>
<p class="footer">Made with IBM Bob</p>
</body>
</html>`;

const outPath = path.join(__dirname, '..', 'barcode-size-test.html');
fs.writeFileSync(outPath, html, 'utf8');
console.log('Written: ' + outPath);
