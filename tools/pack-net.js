// Packs tools/train-net.py's JSON into the compact EVAL_NET literal in engine.js.
// Weight matrices are quantized to int8 with a scale per row (int16 with `16`), biases to
// int16, and stored as base64, which keeps the page small. Replaces the text between the EVAL_NET markers.
//   node tools/pack-net.js <net.json> [8|16]
const fs = require('fs');
const net = JSON.parse(fs.readFileSync(process.argv[2]));
const r5 = (v) => +v.toFixed(5);
// int16 with one scale (biases), or int8 with one scale per row (weight matrices).
function pack(arr) {
  const flat = arr.flat(); const max = Math.max(...flat.map(Math.abs)) || 1; const scale = max / 32767;
  const q = new Int16Array(flat.map((v) => Math.round(v / scale)));
  return { s: +scale.toPrecision(8), d: Buffer.from(q.buffer).toString('base64') };
}
function pack8(rows) {
  const s = rows.map((r) => +((Math.max(...r.map(Math.abs)) || 1) / 127).toPrecision(6));
  const q = new Int8Array(rows.flatMap((r, i) => r.map((v) => Math.round(v / s[i]))));
  return { s, d: Buffer.from(q.buffer).toString('base64') };
}
const bits = process.argv[3] === '16' ? 16 : 8;
const layers = net.W.map((w, i) => ({ rows: w.length, cols: w[0].length, w: bits === 8 ? pack8(w) : pack(w), b: pack([net.B[i]]) }));
const lit = JSON.stringify({ mu: net.mu.map(r5), sd: net.sd.map(r5), layers });
const src = fs.readFileSync('engine.js', 'utf8');
const A = '/* EVAL_NET:begin */', B = '/* EVAL_NET:end */';
const i = src.indexOf(A), j = src.indexOf(B);
if (i < 0 || j < 0) throw new Error('EVAL_NET markers not found in engine.js');
fs.writeFileSync('engine.js', src.slice(0, i + A.length) + lit + src.slice(j));
console.log(`packed ${layers.map((l) => l.rows + 'x' + l.cols).join(' -> ')}: ${lit.length} chars`);
