const { origin, pages, normalize, schema } = require('../public/assets/page-metadata');

function escapeHTML(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderPage(template, pathname) {
  const route = normalize(pathname);
  const page = pages[route];
  if (!page) throw new Error(`Unknown public page: ${route}`);
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${escapeHTML(page.title)}</title>`);
  const metadata = [
    ['name', 'description', page.description],
    ['property', 'og:title', page.title],
    ['property', 'og:description', page.description],
    ['property', 'og:url', origin + route],
    ['name', 'twitter:title', page.title],
    ['name', 'twitter:description', page.description]
  ];
  for (const [attribute, key, value] of metadata) {
    const tag = new RegExp(`<meta ${attribute}="${key}" content="[^"]*"\\s*/?>`);
    html = html.replace(tag, `<meta ${attribute}="${key}" content="${escapeHTML(value)}" />`);
  }
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${origin + route}" />`);
  html = html.replace(/<script id="page-schema" type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script id="page-schema" type="application/ld+json">${JSON.stringify(schema(route)).replace(/</g, '\\u003c')}</script>`);
  return html.replace('<!-- page-introduction -->',
    `<section class="page-introduction"><h1>${escapeHTML(page.heading)}</h1><p>${escapeHTML(page.intro)}</p><p>Loading the interactive studio…</p></section>`);
}

module.exports = { pages, renderPage };
