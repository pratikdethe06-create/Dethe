const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pages, renderPage } = require('../shared/seo-pages');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const decode = value => value.replace(/&amp;/g, '&');

for (const [route, page] of Object.entries(pages)) {
  test(`Initial HTML and built output expose correct SEO for ${route}`, () => {
    const html = renderPage(template, route);
    assert.equal(fs.readFileSync(path.join(root, 'dist', page.file), 'utf8'), html);
    assert.equal(decode(html.match(/<title>(.*?)<\/title>/)[1]), page.title);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www.dethe.in${route}"`));
    assert.match(html, /<h1>[^<]+<\/h1>/);
    assert.match(html, /<a href="\/voices">Voice Library<\/a>/);
    assert.match(html, /<a href="\/privacy.html">Privacy<\/a>/);
    assert.ok(!html.includes('<!-- page-introduction -->'));
    const schema = JSON.parse(html.match(/id="page-schema" type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(schema.url, 'https://www.dethe.in' + route);
    assert.equal(schema.description, page.description);
    assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
    assert.equal((html.match(/application\/ld\+json/g) || []).length, 1);
    assert.equal(renderPage(template, route === '/' ? '/' : route + '/'), html);
  });
}

test('Client navigation updates every route metadata field, including return to home', () => {
  const elements = new Map();
  const document = {
    title: '',
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { setAttribute(key, value) { this[key] = value; } });
      return elements.get(selector);
    },
    getElementById(id) { return this.querySelector('#' + id); }
  };
  const window = { location: { pathname: '/' } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/assets/page-metadata.js'), 'utf8'), { document, window });
  for (const route of ['/voices', '/ai-script', '/video-to-text/', '/']) {
    window.detheUpdateMetadata(route);
    const key = route.replace(/\/+$/, '') || '/';
    assert.equal(document.title, pages[key].title);
    assert.equal(elements.get('link[rel="canonical"]').href, 'https://www.dethe.in' + key);
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
      assert.equal(elements.get(selector).content, pages[key].description);
    }
    assert.equal(elements.get('meta[property="og:url"]').content, 'https://www.dethe.in' + key);
    assert.equal(JSON.parse(elements.get('#page-schema').textContent).url, 'https://www.dethe.in' + key);
  }
});

test('Production routing points to built pages without a soft-404 catch-all', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.buildCommand, 'npm run build');
  for (const [route, page] of Object.entries(pages)) {
    if (route !== '/') assert.ok(config.rewrites.some(rule => rule.source === route && rule.destination === '/' + page.file));
  }
  assert.ok(config.rewrites.every(rule => !rule.source.includes('(?!')));
  assert.match(fs.readFileSync(path.join(root, 'dist/404.html'), 'utf8'), /name="robots" content="noindex"/);
  assert.throws(() => renderPage(template, '/unknown'), /Unknown public page/);
});
