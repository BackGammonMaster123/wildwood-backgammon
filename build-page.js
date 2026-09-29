// Injects the tested engine.js into backgammon.html between the engine/UI markers,
// so the page always ships exactly the engine the Node tests exercise.
const fs = require('fs');
const START = '/* ===== engine (verified rules core) ===== */';
const END = '/* ===== UI ===== */';
let engine = fs.readFileSync('engine.js', 'utf8');
const exp = engine.indexOf("if (typeof module !== 'undefined' && module.exports)");
if (exp < 0) throw new Error('export block not found');
engine = engine.slice(0, exp).trimEnd() + '\n';
if (engine.includes('</script')) throw new Error('engine contains </script');
const html = fs.readFileSync('backgammon.html', 'utf8');
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0 || b < a) throw new Error('markers not found');
const out = html.slice(0, a) + START + '\n' + engine + html.slice(b);
fs.writeFileSync('backgammon.html', out);
console.log(`engine injected: ${engine.length} chars (page ${out.length} chars)`);
