// Read-only DOM geometry of the running app. No screenshots; non-GET API calls are aborted.
// Rows use the same shape as the Figma geometry rows: f = painted box, t = text, m = image, i = icon.
const fs = require('node:fs'), path = require('node:path');
process.env.PLAYWRIGHT_BROWSERS_PATH = 'D:/DatasetFactory/cache/ms-playwright';
const { chromium } = require('C:/Users/t.wisniewski/.traycer/worktrees/thomschery__datasetfactory/feat-figma-datasetfactory-redesign/frontend/node_modules/playwright');
const routes = { upload: '/materials', profile: '/profiles', run: '/run', review: '/annotations/b4a755c9-4e55-4142-bc09-50f7469e124b' };
const widths = [360, 576, 768, 992, 1200, 1400];

function collect() {
  const R = n => Math.round(n);
  const sy = window.scrollY, sx = window.scrollX;
  const rows = [];
  const visibleColor = c => c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c);
  const toHex = c => {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c;
    const p = m[1].split(',').map(s => parseFloat(s));
    const h = '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    return p.length > 3 && p[3] < 1 ? h + '/' + Math.round(p[3] * 100) : h;
  };
  function clipRect(el, r, self = false) {
    let x1 = r.left, y1 = r.top, x2 = r.right, y2 = r.bottom;
    for (let a = self ? el : el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const b = a.getBoundingClientRect();
        if (a !== document.body) { x1 = Math.max(x1, b.left); y1 = Math.max(y1, b.top); x2 = Math.min(x2, b.right); y2 = Math.min(y2, b.bottom); }
      }
    }
    return x2 > x1 && y2 > y1 ? { x: R(x1 + sx), y: R(y1 + sy), w: R(x2 - x1), h: R(y2 - y1) } : null;
  }
  const hidden = el => { const s = getComputedStyle(el); return s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0; };
  const label = el => (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(/\s+/)[0] : '')).slice(0, 34) + (el.disabled || el.getAttribute('aria-disabled') === 'true' ? '[disabled]' : '') + (el.getAttribute('aria-pressed') === 'true' ? '[pressed]' : '');
  function walk(el) {
    if (hidden(el)) return;
    const tag = el.tagName.toLowerCase();
    const r = el.getBoundingClientRect();
    if (tag === 'svg') { const c = clipRect(el, r); if (c && c.w > 0) rows.push(['i', c.x, c.y, c.w, c.h, null]); return; }
    if (tag === 'img' || tag === 'canvas' || tag === 'video') { const c = clipRect(el, r); if (c) rows.push(['m', c.x, c.y, c.w, c.h, 'IMG:' + getComputedStyle(el).objectFit, null, 0, 0, label(el)]); return; }
    const s = getComputedStyle(el);
    if (r.width > 0 && r.height > 0 && el !== document.body && el.id !== 'root') {
      const bg = visibleColor(s.backgroundColor) ? toHex(s.backgroundColor) : null;
      const sides = ['Top', 'Right', 'Bottom', 'Left'].map(k => ({ k, w: parseFloat(s['border' + k + 'Width']) || 0, c: s['border' + k + 'Color'] })).sort((a, b) => b.w - a.w);
      const bw = sides[0].w;
      const bc = bw > 0 && visibleColor(sides[0].c) ? toHex(sides[0].c) + (sides.every(x => x.w === bw) ? '' : ':' + sides.filter(x => x.w === bw).map(x => x.k[0]).join('')) : null;
      if (bg || bc) { const c = clipRect(el, r); if (c) rows.push(['f', c.x, c.y, c.w, c.h, bg, bc, bc ? bw : 0, parseFloat(s.borderTopLeftRadius) || 0, label(el)]); }
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        const text = tag === 'select' ? (el.selectedOptions[0]?.textContent || '') : (el.value || el.placeholder || '');
        const c = clipRect(el, r);
        if (c && text.trim() && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'range') rows.push(['t', c.x + (parseFloat(s.paddingLeft) || 0), c.y, Math.min(c.w, text.length * parseFloat(s.fontSize) * 0.55), c.h, toHex(el.value || tag === 'select' ? s.color : '#959eb0'), text.trim().slice(0, 48), parseFloat(s.fontSize), parseInt(s.fontWeight, 10)]);
      }
    }
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim()) {
        const range = document.createRange(); range.selectNodeContents(node);
        const tr = range.getBoundingClientRect(); const c = tr.width > 0 ? clipRect(el, tr, true) : null;
        if (c) rows.push(['t', c.x, c.y, c.w, c.h, toHex(s.color), node.textContent.trim().replace(/\s+/g, ' ').slice(0, 48), parseFloat(s.fontSize), parseInt(s.fontWeight, 10)]);
      } else if (node.nodeType === 1) walk(node);
    }
  }
  walk(document.body);
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i][2] + rows[i][4] <= 0 || rows[i][3] <= 2 || rows[i][4] <= 2) rows.splice(i, 1);
  const de = document.documentElement;
  return { url: location.pathname, page: toHex(getComputedStyle(document.body).backgroundColor), viewport: { w: innerWidth, h: innerHeight, clientWidth: de.clientWidth, scrollWidth: de.scrollWidth, docHeight: de.scrollHeight }, rows };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const blocked = [];
  await context.route('**/api/**', r => ['GET', 'HEAD', 'OPTIONS'].includes(r.request().method()) ? r.continue() : (blocked.push(r.request().method() + ' ' + r.request().url()), r.abort()));
  const page = await context.newPage(), results = [];
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  async function capture(screen, width, state) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const data = await page.evaluate(collect);
    results.push({ screen, width, state, ...data });
    console.log(screen, width, state, 'rows', data.rows.length, 'doc', data.viewport.docHeight, 'scrollW', data.viewport.scrollWidth, '/', data.viewport.clientWidth);
  }
  for (const [screen, route] of Object.entries(routes)) {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('http://127.0.0.1:5173' + route); await page.waitForLoadState('networkidle'); await page.evaluate(() => document.fonts.ready);
    if (screen !== 'upload') await page.locator('main img').first().waitFor({ state: 'visible' });
    for (const width of widths) { await page.setViewportSize({ width, height: 900 }); await settle(); await capture(screen, width, 'default'); }
    if (screen === 'review') {
      await page.setViewportSize({ width: 768, height: 900 }); await settle();
      const close = page.getByRole('button', { name: 'Zwiń listę Klasy profilu', exact: true });
      if (await close.isVisible()) { await close.click(); await settle(); await capture(screen, 768, 'class-picker-closed'); }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'app-geometry.json'), JSON.stringify({ capturedAt: new Date().toISOString(), source: 'http://127.0.0.1:5173', method: 'Playwright DOM geometry; no screenshots; non-GET API aborted', viewportHeight: 900, blockedWrites: blocked, results }));
  console.log('blocked writes', blocked.length);
})().catch(e => { console.error(e); process.exitCode = 1; });
