/**
 * 78_env_diff_test.js
 *
 * 还原 keys2 环境依赖项：
 * 1. 浏览器抓环境快照（navigator/screen/plugins/canvas 指纹等）
 * 2. jsdom 差分注入各环境项 → 对比 keys2 变化 → 定位影响项
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

/** 浏览器环境快照 */
async function browserEnvSnapshot() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    await page.goto('about:blank');
    const snap = await page.evaluate(() => {
      const out = {};
      try {
        out.ua = navigator.userAgent;
        out.platform = navigator.platform;
        out.language = navigator.language;
        out.hardwareConcurrency = navigator.hardwareConcurrency;
        out.deviceMemory = navigator.deviceMemory;
        out.plugins = Array.from(navigator.plugins || []).map(p => ({ name: p.name, filename: p.filename, description: p.description }));
        out.screen = { w: screen.width, h: screen.height, aw: screen.availWidth, ah: screen.availHeight, cd: screen.colorDepth, pd: screen.pixelDepth, drp: (window.devicePixelRatio || 1) };
        out.inner = { w: innerWidth, h: innerHeight, ow: outerWidth, oh: outerHeight };
        out.timezone = new Date().getTimezoneOffset();
        // canvas 指纹（toDataURL）
        try {
          const c = document.createElement('canvas'); c.width = 220; c.height = 30;
          const ctx = c.getContext('2d');
          ctx.textBaseline = 'top'; ctx.font = "14px 'Arial'";
          ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20);
          ctx.fillStyle = '#069'; ctx.fillText('Cwm fjordbank glyphs vext quiz, \ud83d\ude03', 2, 15);
          out.canvasDataURL = c.toDataURL().substring(0, 200);
        } catch (e) { out.canvasErr = e.message; }
        // fonts
        try { out.fontsCheck = document.fonts ? document.fonts.check('14px Arial') : null; } catch (e) {}
        out.vendor = navigator.vendor;
        out.webdriver = navigator.webdriver;
        out.maxTouch = navigator.maxTouchPoints;
      } catch (e) { out.err = e.message; }
      return out;
    });
    await context.close();
    return snap;
  } finally { await browser.close(); }
}

/** jsdom keys2（带 O + 可选环境注入） */
async function jsdomKeysWithEnv(nsd, cd, oCookie, envPatch) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  if (oCookie) {
    let cj = oCookie;
    Object.defineProperty(window.document, 'cookie', { get() { return cj; }, set(v) { cj = cj ? cj + '; ' + v : v; }, configurable: true });
  }
  // 环境注入（差分）
  if (envPatch) envPatch(window);
  // 数组陷阱
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
    if (!a) return;
    if (a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    if (a.filter(b => b >= 32 && b <= 126).length < a.length * 0.4) found.push(a);
  };
  for (const C of [window.Array, window.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
    }
  }
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 10000)); } catch (e) {}
  window.close();
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  return dedup(found)[0] || null;
}

async function main() {
  console.log('[1] 浏览器环境快照...');
  const snap = await browserEnvSnapshot();
  console.log('  UA:', snap.ua);
  console.log('  plugins:', (snap.plugins || []).length, '个');
  console.log('  screen:', JSON.stringify(snap.screen));
  console.log('  canvasDataURL:', (snap.canvasDataURL || '').substring(0, 60));
  fs.writeFileSync(path.join(OUT, 'env_snapshot_' + Date.now() + '.json'), JSON.stringify(snap, null, 2));

  // 挑战页（拿 cd + O）
  const https = require('https');
  const ch = await new Promise(r => {
    const req = https.get(TARGET, { rejectUnauthorized: false, headers: { 'User-Agent': UA } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '', headers: {} }));
    req.setTimeout(60000, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('\n[2] nsd:', nsd, 'O:', oCookie.substring(0, 20));

  // 差分测试：基线 + 各环境注入
  const base = await jsdomKeysWithEnv(nsd, cd, oCookie, null);
  console.log('\n基线 jsdom keys2:', base ? base.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');

  const variants = {
    'plugins(浏览器5个)': (w) => {
      const plugins = { length: 5, item: (i) => ({ name: 'x', filename: 'x', description: 'x' }), namedItem: () => null };
      try { Object.defineProperty(w.navigator, 'plugins', { value: plugins, configurable: true }); } catch (e) {}
    },
    'screen(浏览器值)': (w) => {
      try {
        Object.defineProperty(w.screen, 'width', { value: snap.screen.w, configurable: true });
        Object.defineProperty(w.screen, 'height', { value: snap.screen.h, configurable: true });
        Object.defineProperty(w.screen, 'colorDepth', { value: snap.screen.cd, configurable: true });
      } catch (e) {}
    },
    'hardwareConcurrency': (w) => { try { Object.defineProperty(w.navigator, 'hardwareConcurrency', { value: snap.hardwareConcurrency, configurable: true }); } catch (e) {} },
    'canvas(浏览器指纹)': (w) => {
      if (w.HTMLCanvasElement && w.HTMLCanvasElement.prototype) {
        w.HTMLCanvasElement.prototype.toDataURL = function () { return snap.canvasDataURL; };
        w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, p) => { if (p === 'canvas') return this; return () => {}; } }); };
      }
    },
    'timezone': (w) => { try { const d = new Date(); d.getTimezoneOffset = () => snap.timezone; } catch (e) {} },
  };
  for (const [name, patch] of Object.entries(variants)) {
    const k = await jsdomKeysWithEnv(nsd, cd, oCookie, patch);
    const same = base && k && base.length === k.length && base.every((v, i) => v === k[i]);
    console.log(`${name}: keys2=${k ? k.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无'} ${same ? '（无变化）' : '★ 变化!'}`);
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
