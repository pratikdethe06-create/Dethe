const fs = require('node:fs');
const path = require('node:path');
const { pages, renderPage } = require('../shared/seo-pages');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const source = path.join(root, 'public');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
const template = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
for (const [route, page] of Object.entries(pages)) {
  fs.writeFileSync(path.join(output, page.file), renderPage(template, route));
}
console.log(`Built ${Object.keys(pages).length} public pages with route-specific HTML in dist/`);
