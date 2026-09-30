// Runs every suite from the repo root and exits non-zero if any fails.
// --no-browser skips the Playwright suite (needs Chromium: `npx playwright install chromium`).
const { spawnSync } = require('child_process');
const noBrowser = process.argv.includes('--no-browser');
const suites = ['test', 'net-test', 'level-test', 'cube-test', 'match-test', 'review-test', 'adapter-test',
  'cube-flow', 'match-flow', 'quiz-test', 'progress-test', 'review-flow',
  'verify', 'verify2', 'freeze3', 'match-smoke'];
if (!noBrowser) suites.push('feel-test');
let bad = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, ['tests/' + s + '.js'], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout + r.stderr).trim().split('\n');
  const last = out[out.length - 1] || '';
  const failed = r.status !== 0 || /[1-9]\d* failed/.test(last) || /errors: (?!\(none\))/.test(out.join('\n'));
  if (failed) bad++;
  console.log((failed ? 'FAIL ' : 'ok   ') + s.padEnd(14) + last.slice(0, 100));
}
console.log(bad ? `\n${bad} suite(s) failed` : '\nall suites passed');
process.exit(bad ? 1 : 0);
