// Turns wildbg-frame positions (tools/net-gen.js) and their wildbg labels (wildbg-kit/label.rs)
// into float32 matrices for tools/train-net.py:  <prefix>.x (N x NET_IN)  <prefix>.y (N x 5)
//   node tools/net-features.js <positions.txt> <labels.txt> <prefix>
const E = require('../engine.js');
const fs = require('fs');
const [pf, lf, prefix] = process.argv.slice(2);
const P = fs.readFileSync(pf, 'utf8').trim().split('\n'), L = fs.readFileSync(lf, 'utf8').trim().split('\n');
if (P.length !== L.length) throw new Error('positions/labels length mismatch');
// A wildbg-frame position is a board with White on roll.
function toBoard(pips) {
  const points = new Array(25).fill(0);
  for (let i = 1; i <= 24; i++) points[i] = pips[i];
  let w = pips[25], bk = -pips[0];
  for (let i = 1; i <= 24; i++) { if (pips[i] > 0) w += pips[i]; else bk -= pips[i]; }
  return { points, bar: { w: pips[25], b: -pips[0] }, off: { w: 15 - w, b: 15 - bk } };
}
const X = new Float32Array(P.length * E.NET_IN), Y = new Float32Array(P.length * 5); let n = 0;
for (let r = 0; r < P.length; r++) {
  const y = L[r].split(' ').map(Number); if (y.some(isNaN)) continue;
  const x = E.netInputs(toBoard(P[r].split(' ').map(Number)), 'w');
  X.set(x, n * E.NET_IN); Y.set(y, n * 5); n++;
}
fs.writeFileSync(prefix + '.x', Buffer.from(X.buffer, 0, n * E.NET_IN * 4));
fs.writeFileSync(prefix + '.y', Buffer.from(Y.buffer, 0, n * 5 * 4));
console.log(`${n} rows x ${E.NET_IN} inputs -> ${prefix}.x/.y`);
