// The test corpus.
//
// Every page here is hand-written markup over an unmodified, shipped stylesheet
// from npm (see setup-fixtures.mjs) — Bootstrap, Bulma, Pico, github-markdown-css.
// The markup follows each framework's documented patterns, so the cascade the
// capture has to reproduce is the real one: hundreds of selectors, custom
// properties, media queries, pseudo-elements, the lot.
//
// They are generated rather than checked in as .html so the content can be scaled
// (`repeat` below) without a megabyte of committed fixture, and so it is obvious
// at a glance that the interesting part is the stylesheet, not the prose.
//
// A note on what this corpus is and isn't: it is a stand-in for real sites, not a
// sample of them. It covers the three CSS architectures that matter for this
// question — semantic/component CSS (Bootstrap, Bulma), element-selector CSS
// (Pico, markdown), and utility CSS (the tailwind-ish page) — but a corpus of
// actual scraped pages would be better, and should be the next measurement once
// one is available.

// Exported so encoding-test.mjs can strip it out of a held-out dictionary. Every
// fixture draws from the same pool, which is fine for size and fidelity work and
// is *not* fine for dictionary work: a dictionary built from four fixtures would
// contain the fifth one's prose verbatim and report a saving nothing in
// production could reproduce.
export const PROSE = [
	'The link is the file, which means the only budget that matters is the one the URL has.',
	'Everything runs client side; there is no upload, no bucket, and nothing to take down.',
	'Compression is the whole game once the format stops wasting bytes on structure.',
	'A payload that survives a chat client intact is worth more than one that is merely small.',
	'Fidelity and size pull in opposite directions, so the only honest answer is a measurement.',
];

/** @param {number} i */
const para = (i) => PROSE[i % PROSE.length];

/** Build `n` items with a template. @param {number} n @param {(i:number)=>string} fn */
const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('\n');

// ── Bootstrap: an admin dashboard ────────────────────────────────────────────
// Component CSS at its densest — every element carries several framework classes
// that each contribute a handful of declarations, which is the case the merged
// strategy is supposed to handle well.
const bootstrapDashboard = (repeat = 8) => `
<nav class="navbar navbar-expand-lg bg-dark navbar-dark sticky-top">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">linkify.ink</a>
    <ul class="navbar-nav me-auto">
      ${times(5, (i) => `<li class="nav-item"><a class="nav-link${i === 0 ? ' active' : ''}" href="/s/${i}">Section ${i + 1}</a></li>`)}
    </ul>
    <form class="d-flex" role="search">
      <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search">
      <button class="btn btn-outline-light" type="submit">Search</button>
    </form>
  </div>
</nav>
<div class="container-fluid">
  <div class="row">
    <aside class="col-md-3 col-lg-2 bg-body-tertiary p-3">
      <ul class="nav flex-column">
        ${times(10, (i) => `<li class="nav-item"><a class="nav-link link-body-emphasis" href="/n/${i}">Nav entry ${i + 1}</a></li>`)}
      </ul>
    </aside>
    <main class="col-md-9 col-lg-10 px-md-4 py-4">
      <div class="d-flex justify-content-between flex-wrap align-items-center pb-2 mb-3 border-bottom">
        <h1 class="h2">Dashboard</h1>
        <div class="btn-toolbar">
          <div class="btn-group me-2">
            <button type="button" class="btn btn-sm btn-outline-secondary">Share</button>
            <button type="button" class="btn btn-sm btn-outline-secondary">Export</button>
          </div>
          <button type="button" class="btn btn-sm btn-primary">This week</button>
        </div>
      </div>
      <div class="row g-3 mb-4">
        ${times(4, (i) => `
        <div class="col-sm-6 col-xl-3">
          <div class="card shadow-sm h-100">
            <div class="card-body">
              <h5 class="card-title">Metric ${i + 1}</h5>
              <p class="card-text display-6">${(i + 3) * 1247}</p>
              <span class="badge text-bg-${['success', 'warning', 'danger', 'info'][i]}">+${i + 2}.${i}%</span>
              <div class="progress mt-3" role="progressbar">
                <div class="progress-bar bg-${['success', 'warning', 'danger', 'info'][i]}" style="width:${30 + i * 15}%"></div>
              </div>
            </div>
          </div>
        </div>`)}
      </div>
      <div class="row g-4">
        ${times(repeat, (i) => `
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
              <strong>Report ${i + 1}</strong>
              <span class="badge rounded-pill text-bg-secondary">${i * 7 + 3}</span>
            </div>
            <div class="card-body">
              <p class="card-text">${para(i)}</p>
              <table class="table table-sm table-striped table-hover align-middle">
                <thead><tr><th scope="col">#</th><th scope="col">Name</th><th scope="col">Status</th><th scope="col" class="text-end">Size</th></tr></thead>
                <tbody>
                  ${times(6, (j) => `<tr><th scope="row">${j + 1}</th><td>entry-${i}-${j}.txt</td><td><span class="badge text-bg-${j % 3 === 0 ? 'success' : j % 3 === 1 ? 'secondary' : 'warning'}">${j % 3 === 0 ? 'ready' : j % 3 === 1 ? 'idle' : 'queued'}</span></td><td class="text-end font-monospace">${(j + 1) * 128} B</td></tr>`)}
                </tbody>
              </table>
              <div class="d-flex gap-2">
                <a href="/r/${i}" class="btn btn-primary btn-sm">Open</a>
                <a href="/r/${i}/raw" class="btn btn-outline-secondary btn-sm">Raw</a>
              </div>
            </div>
            <div class="card-footer text-body-secondary">Updated ${i + 1} hours ago</div>
          </div>
        </div>`)}
      </div>
      <nav class="mt-4"><ul class="pagination">
        ${times(7, (i) => `<li class="page-item${i === 2 ? ' active' : ''}"><a class="page-link" href="/p/${i}">${i + 1}</a></li>`)}
      </ul></nav>
    </main>
  </div>
</div>
<footer class="bg-body-tertiary border-top py-4 mt-5"><div class="container"><p class="text-body-secondary mb-0">${para(1)}</p></div></footer>
`;

// ── Bulma: a marketing landing page ──────────────────────────────────────────
// Big decorative boxes, gradients, a pricing grid: the shape where a capture is
// most obviously right or wrong at a glance.
const bulmaLanding = (repeat = 9) => `
<section class="hero is-primary is-medium">
  <div class="hero-head"><nav class="navbar"><div class="container">
    <div class="navbar-brand"><a class="navbar-item"><strong>linkify.ink</strong></a></div>
    <div class="navbar-menu is-active"><div class="navbar-end">
      ${times(4, (i) => `<a class="navbar-item" href="/b/${i}">Link ${i + 1}</a>`)}
      <span class="navbar-item"><a class="button is-white is-outlined">Get started</a></span>
    </div></div>
  </div></nav></div>
  <div class="hero-body"><div class="container has-text-centered">
    <h1 class="title is-1">Share files without uploading them</h1>
    <h2 class="subtitle is-4">${para(0)}</h2>
    <div class="buttons is-centered">
      <a class="button is-large is-link">Try it</a><a class="button is-large is-light">Read the docs</a>
    </div>
  </div></div>
</section>
<section class="section">
  <div class="container">
    <div class="columns is-multiline">
      ${times(repeat, (i) => `
      <div class="column is-one-third">
        <div class="card">
          <div class="card-content">
            <div class="media">
              <div class="media-left"><figure class="image is-48x48"><span class="tag is-large is-rounded is-${['info', 'success', 'warning'][i % 3]}">${i + 1}</span></figure></div>
              <div class="media-content"><p class="title is-5">Feature ${i + 1}</p><p class="subtitle is-6">@feature-${i}</p></div>
            </div>
            <div class="content">${para(i)}
              <div class="tags">${times(3, (j) => `<span class="tag is-${['primary', 'link', 'dark'][j]}">tag-${j}</span>`)}</div>
            </div>
          </div>
          <footer class="card-footer"><a href="/f/${i}" class="card-footer-item">More</a><a href="/f/${i}/x" class="card-footer-item">Share</a></footer>
        </div>
      </div>`)}
    </div>
    <div class="notification is-warning"><button class="delete"></button>${para(3)}</div>
    <table class="table is-fullwidth is-striped is-hoverable">
      <thead><tr><th>Plan</th><th>Size limit</th><th>Encryption</th><th>Price</th></tr></thead>
      <tbody>${times(5, (i) => `<tr><td><strong>Tier ${i + 1}</strong></td><td>${(i + 1) * 32} KB</td><td>${i % 2 ? 'AES-GCM' : 'none'}</td><td class="has-text-right">$${i * 4}</td></tr>`)}</tbody>
    </table>
  </div>
</section>
<footer class="footer"><div class="content has-text-centered"><p>${para(4)}</p></div></footer>
`;

// ── Pico: element-selector CSS, no classes at all ────────────────────────────
// The opposite end of the spectrum from Bootstrap: almost every declaration
// arrives via a tag selector, so nearly every element of a given kind ends up
// with an identical computed style. The best case for class sharing.
const picoDocs = (repeat = 14) => `
<header class="container">
  <nav>
    <ul><li><strong>linkify.ink</strong></li></ul>
    <ul>${times(4, (i) => `<li><a href="/d/${i}">Docs ${i + 1}</a></li>`)}<li><a href="/x" role="button">Install</a></li></ul>
  </nav>
  <hgroup><h1>Encoding files into URLs</h1><p>${para(0)}</p></hgroup>
</header>
<main class="container">
  ${times(repeat, (i) => `
  <section>
    <h2>Chapter ${i + 1}</h2>
    <p>${para(i)} ${para(i + 1)}</p>
    <blockquote>${para(i + 2)}<footer><cite>— section ${i + 1}</cite></footer></blockquote>
    <h3>Details</h3>
    <ul>${times(4, (j) => `<li>Point ${j + 1}: ${para(i + j)}</li>`)}</ul>
    <pre><code>const url = await linkify.createLink(files, { encryption: 'password' });
// chapter ${i + 1}, step ${i % 4}</code></pre>
    <table>
      <thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead>
      <tbody>${times(4, (j) => `<tr><td><code>field_${j}</code></td><td>${['string', 'number', 'bytes', 'bool'][j]}</td><td>${para(j)}</td></tr>`)}</tbody>
    </table>
    <details><summary>More about chapter ${i + 1}</summary><p>${para(i + 3)}</p></details>
  </section>`)}
</main>
<footer class="container"><small>${para(2)}</small></footer>
`;

// ── github-markdown-css: the README shape ────────────────────────────────────
// Long, text-heavy, one wrapper class and otherwise pure element selectors. The
// closest thing in the corpus to what an article-mode capture already handles
// well, included as the case where the new method has the least to prove.
const markdownArticle = (repeat = 18) => `
<article class="markdown-body">
  <h1>linkify.ink</h1>
  <p>${para(0)}</p>
  <p><img src="https://example.invalid/badge.svg" alt="build"> <img src="https://example.invalid/v.svg" alt="version"></p>
  ${times(repeat, (i) => `
  <h2>Heading ${i + 1}</h2>
  <p>${para(i)} See <a href="/a/${i}">the notes</a> and <code>inline_code_${i}</code>.</p>
  <ul>${times(3, (j) => `<li><strong>Item ${j + 1}</strong> — ${para(i + j)}</li>`)}</ul>
  <pre><code>$ npm run build
$ node demo/run.mjs --case ${i}</code></pre>
  <blockquote><p><strong>Note</strong><br>${para(i + 1)}</p></blockquote>
  <table><thead><tr><th>Option</th><th align="right">Default</th></tr></thead>
  <tbody>${times(3, (j) => `<tr><td><code>opt-${j}</code></td><td align="right">${j * 10}</td></tr>`)}</tbody></table>`)}
</article>
`;

// ── Utility CSS ──────────────────────────────────────────────────────────────
// A deliberately atomic stylesheet, applied the way Tailwind applies one: long
// class attributes, one declaration per class. Included because it is the
// adversarial case for the whole idea — the page's own CSS is already close to
// minimal, so a computed-style rebuild has the least room to win.
const UTILITY_CSS = `
*,::before,::after{box-sizing:border-box;border:0 solid #e5e7eb}
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5;color:#111827;background:#fff}
.flex{display:flex}.grid{display:grid}.block{display:block}.hidden{display:none}
.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}
.justify-between{justify-content:space-between}.justify-center{justify-content:center}
.gap-2{gap:.5rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}
.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.p-2{padding:.5rem}.p-4{padding:1rem}.p-6{padding:1.5rem}.px-4{padding-left:1rem;padding-right:1rem}
.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-12{padding-top:3rem;padding-bottom:3rem}
.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mb-8{margin-bottom:2rem}.mx-auto{margin-left:auto;margin-right:auto}
.max-w-5xl{max-width:64rem}.w-full{width:100%}
.text-sm{font-size:.875rem;line-height:1.25rem}.text-lg{font-size:1.125rem;line-height:1.75rem}
.text-2xl{font-size:1.5rem;line-height:2rem}.text-4xl{font-size:2.25rem;line-height:2.5rem}
.font-semibold{font-weight:600}.font-bold{font-weight:700}.font-mono{font-family:ui-monospace,monospace}
.text-gray-500{color:#6b7280}.text-gray-900{color:#111827}.text-white{color:#fff}.text-blue-600{color:#2563eb}
.bg-white{background-color:#fff}.bg-gray-50{background-color:#f9fafb}.bg-gray-100{background-color:#f3f4f6}
.bg-blue-600{background-color:#2563eb}.bg-emerald-500{background-color:#10b981}.bg-amber-500{background-color:#f59e0b}
.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-full{border-radius:9999px}
.border{border-width:1px}.border-b{border-bottom-width:1px}.border-gray-200{border-color:#e5e7eb}
.shadow{box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)}
.shadow-lg{box-shadow:0 10px 15px rgba(0,0,0,.1),0 4px 6px rgba(0,0,0,.05)}
.uppercase{text-transform:uppercase}.tracking-wide{letter-spacing:.025em}.underline{text-decoration-line:underline}
.overflow-hidden{overflow:hidden}.relative{position:relative}.sticky{position:sticky}.top-0{top:0}
`;

const utilityApp = (repeat = 12) => `
<header class="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
  <span class="text-lg font-bold text-gray-900">linkify.ink</span>
  <nav class="flex gap-4">${times(4, (i) => `<a href="/u/${i}" class="text-sm text-gray-500 underline">Link ${i + 1}</a>`)}</nav>
</header>
<main class="max-w-5xl mx-auto px-4 py-12">
  <h1 class="text-4xl font-bold text-gray-900 mb-4">Utility classes</h1>
  <p class="text-lg text-gray-500 mb-8">${para(0)}</p>
  <div class="grid grid-cols-3 gap-6">
    ${times(repeat, (i) => `
    <section class="bg-white border border-gray-200 rounded-lg shadow p-6 flex flex-col gap-2 overflow-hidden">
      <span class="text-sm uppercase tracking-wide text-gray-500">Card ${i + 1}</span>
      <h2 class="text-2xl font-semibold text-gray-900">Item ${i + 1}</h2>
      <p class="text-sm text-gray-500">${para(i)}</p>
      <div class="flex gap-2 mb-2">${times(3, (j) => `<span class="text-sm px-4 py-2 rounded-full ${['bg-blue-600', 'bg-emerald-500', 'bg-amber-500'][j]} text-white">t${j}</span>`)}</div>
      <code class="font-mono text-sm bg-gray-100 p-2 rounded block">item-${i}.txt</code>
    </section>`)}
  </div>
  <div class="bg-gray-50 rounded-lg p-6 mt-8 shadow-lg">
    <h2 class="text-2xl font-semibold mb-4">${para(2)}</h2>
    ${times(6, (i) => `<div class="flex justify-between py-2 border-b border-gray-200"><span class="text-sm">row ${i + 1}</span><span class="text-sm font-mono text-blue-600">${i * 512} B</span></div>`)}
  </div>
</main>
`;

/**
 * @typedef {{ name: string, description: string, sheets: string[], inlineCss?: string, body: string }} Fixture
 */

/**
 * The corpus, at a given content multiplier.
 *
 * `scale` repeats the body content without touching the stylesheet, which is what
 * separates "the page has more elements" from "the page has more distinct styles"
 * — the two grow very differently, and the second is what decides whether sharing
 * styles between elements is worth doing at all.
 *
 * @param {number} [scale]
 * @returns {Fixture[]}
 */
export function makeFixtures(scale = 1) {
	const n = (base) => Math.round(base * scale);
	return [
		{
			name: 'bootstrap-dashboard',
			description: 'Bootstrap 5.3 admin dashboard — component CSS, many classes per element',
			sheets: ['bootstrap.css'],
			body: bootstrapDashboard(n(8)),
		},
		{
			name: 'bulma-landing',
			description: 'Bulma 1.0 marketing page — hero, card grid, pricing table',
			sheets: ['bulma.css'],
			body: bulmaLanding(n(9)),
		},
		{
			name: 'pico-docs',
			description: 'Pico 2.1 documentation page — pure element-selector CSS',
			sheets: ['pico.css'],
			body: picoDocs(n(14)),
		},
		{
			name: 'markdown-article',
			description: 'github-markdown-css README — long-form text, the article-mode case',
			sheets: ['markdown.css'],
			body: markdownArticle(n(18)),
		},
		{
			name: 'utility-app',
			description: 'Tailwind-shaped utility CSS — the adversarial case, page CSS already atomic',
			sheets: [],
			inlineCss: UTILITY_CSS,
			body: utilityApp(n(12)),
		},
	];
}

/** @type {Fixture[]} */
export const FIXTURES = makeFixtures();

/**
 * @param {Fixture} fixture
 * @returns {string}
 */
export function renderFixture(fixture) {
	const links = fixture.sheets.map((s) => `<link rel="stylesheet" href="/vendor/${s}">`).join('');
	const inline = fixture.inlineCss ? `<style>${fixture.inlineCss}</style>` : '';
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${fixture.name}</title>
${links}${inline}
</head><body>
${fixture.body}
</body></html>`;
}
