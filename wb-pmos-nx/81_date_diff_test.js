/**
 * 81_date_diff_test.js
 *
 * 假设：keys2 含页面初始化时间（r2mkaTime）→ jsdom 与浏览器初始化时间不同 → keys2 不同
 * 差分：jsdom mock Date（不同时间点）→ keys2 是否变化
 * 若变化 → keys2 = f(cd, 时间) → 用 O 签发时间（挑战页）→ 纯算法
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

function httpGet(url) {
  return new Promise(r => {
    const req = https.get(url, { rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', (e) => r({ status: 'ERR', body: '', headers: {} }));
    req.setTimeout(60000, () => { req.destroy(); r({ status: 'TIMEOUT', body: '', headers: {} }); });
  });
}

async function jsdomKeys(nsd, cd, oCookie, mockTime) {
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
  // mock Date（时间差分）
  if (mockTime) {
    const RealDate = window.Date;
    window.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(mockTime);
        else super(...args);
      }
      static now() { return mockTime; }
    };
    window.Date.now = () => mockTime;
    window.Date.prototype.getTime = function () { return mockTime; };
  }
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

(async () => {
  const ch = await httpGet(TARGET);
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无挑战'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  const serverDate = Math.floor(new Date(ch.headers['date']).getTime() / 1000);
  console.log('nsd:', nsd, '挑战页服务器时间:', serverDate, '本地 now:', Math.floor(Date.now() / 1000));

  // 差分：真实时间 vs mock 时间（±60s）
  const tReal = Date.now();
  const base = await jsdomKeys(nsd, cd, oCookie, null);
  console.log('\n基线 keys2:', base ? base.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');

  for (const [name, t] of [
    ['mock serverDate', serverDate * 1000],
    ['mock now-60s', tReal - 60000],
    ['mock now+60s', tReal + 60000],
    ['mock now-3600s', tReal - 3600000],
  ]) {
    const k = await jsdomKeys(nsd, cd, oCookie, t);
    const same = base && k && base.every((v, i) => v === k[i]);
    console.log(`${name}: ${k ? k.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无'} ${same ? '（同基线）' : '★ 变化!'}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
