/**
 * 87_env_deep_diff.js
 *
 * 深度环境差分：jsdom 注入 20 项环境值 → keys2 变化定位依赖项
 * 目标：找 jsdom keys2 ≠ 浏览器的环境依赖项
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function jsdomRun(nsd, cd, oCookie, patch) {
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
  if (patch) patch(window);
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
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 15000)); } catch (e) {}
  window.close();
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  return dedup(found)[0] || null;
}

(async () => {
  // 拉新挑战（新鲜 cd）
  const https = require('https');
  const ch = await new Promise(r => {
    const req = https.get(TARGET, { rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '', headers: {} }));
    req.setTimeout(60000, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('nsd:', nsd);

  // 基线
  const base = await jsdomRun(nsd, cd, oCookie, null);
  console.log('基线 keys2:', base ? base.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  if (!base) { console.log('基线无 keys2'); process.exit(1); }

  // 20 项环境差分
  const variants = {
    'UA变体': (w) => { try { Object.defineProperty(w.navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', configurable: true }); } catch (e) {} },
    'language': (w) => { try { Object.defineProperty(w.navigator, 'language', { value: 'en-US', configurable: true }); } catch (e) {} },
    'platform': (w) => { try { Object.defineProperty(w.navigator, 'platform', { value: 'Win32', configurable: true }); } catch (e) {} },
    'maxTouch': (w) => { try { Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true }); } catch (e) {} },
    'webdriver': (w) => { try { Object.defineProperty(w.navigator, 'webdriver', { value: true, configurable: true }); } catch (e) {} },
    'vendor': (w) => { try { Object.defineProperty(w.navigator, 'vendor', { value: 'Google Inc.', configurable: true }); } catch (e) {} },
    'innerSize': (w) => { try { Object.defineProperty(w, 'innerWidth', { value: 1920, configurable: true }); Object.defineProperty(w, 'innerHeight', { value: 1080, configurable: true }); } catch (e) {} },
    'devicePixelRatio': (w) => { try { Object.defineProperty(w, 'devicePixelRatio', { value: 2, configurable: true }); } catch (e) {} },
    'screenOr': (w) => { try { Object.defineProperty(w.screen, 'orientation', { value: { angle: 90, type: 'portrait-primary' }, configurable: true }); } catch (e) {} },
    'performanceNow': (w) => { try { w.performance.now = () => 1234567.89; } catch (e) {} },
    'MathRandom': (w) => { const orig = w.Math.random; w.Math.random = () => 0.5; },
    'connection': (w) => { try { Object.defineProperty(w.navigator, 'connection', { value: { effectiveType: '4g', rtt: 50, downlink: 10 }, configurable: true }); } catch (e) {} },
    'referrer': (w) => { try { Object.defineProperty(w.document, 'referrer', { value: 'https://google.com/', configurable: true }); } catch (e) {} },
    'name': (w) => { try { Object.defineProperty(w, 'name', { value: 'test', configurable: true }); } catch (e) {} },
    'readyState': (w) => { try { Object.defineProperty(w.document, 'readyState', { value: 'interactive', configurable: true }); } catch (e) {} },
    'visibility': (w) => { try { Object.defineProperty(w.document, 'visibilityState', { value: 'hidden', configurable: true }); } catch (e) {} },
    'documentElement': (w) => { try { w.document.documentElement.clientWidth = 1920; w.document.documentElement.clientHeight = 1080; } catch (e) {} },
    'chromeObj': (w) => { try { w.chrome = { app: {}, runtime: {}, loadTimes: () => ({}), csi: () => ({}) }; } catch (e) {} },
    'fontsCheck': (w) => { try { if (w.document.fonts) w.document.fonts.check = () => false; } catch (e) {} },
    'doNotTrack': (w) => { try { Object.defineProperty(w.navigator, 'doNotTrack', { value: '1', configurable: true }); } catch (e) {} },
  };
  const changes = [];
  for (const [name, patch] of Object.entries(variants)) {
    const k = await jsdomRun(nsd, cd, oCookie, patch);
    const same = k && base.length === k.length && base.every((v, i) => v === k[i]);
    console.log(`${name}: ${k ? k.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无'} ${same ? '（无变化）' : '★ 变化!'}`);
    if (!same) changes.push(name);
  }
  console.log('\n变化项:', changes.length ? changes.join(', ') : '无（keys2 不依赖任何注入项）');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
