// Wraps the backgammon.html fragment in a full HTML document for GitHub Pages.
// Output goes to _site/ (git-ignored); the fragment stays the only copy of the app.
const fs = require('fs');
const html = fs.readFileSync('backgammon.html', 'utf8');
if (!html.trimEnd().endsWith('</script>')) throw new Error('backgammon.html must end with </script>');
// Same base styles the test harnesses wrap the fragment in.
const doc = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<style>body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style>\n'
  + '</head>\n<body>\n' + html.trimEnd() + '\n</body>\n</html>\n';
fs.mkdirSync('_site', { recursive: true });
fs.writeFileSync('_site/index.html', doc);
fs.writeFileSync('_site/.nojekyll', '');
console.log(`site built: _site/index.html (${doc.length} chars)`);
