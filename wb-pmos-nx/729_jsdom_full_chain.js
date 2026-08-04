/**
 * 729_jsdom_full_chain.js
 * 基于 AgentA 核心发现（aebi/scj 由挑战 js 生成）+ AgentB 环境补全：
 * jsdom 先跑挑战 js（生成 $_ts.aebi/scj）→ 再跑应用 js → 捕获 basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const CHALLENGE_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  console.log('nsd=' + nsd + ' cd len=' + cd.length);

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://pmos.nx.sgcc.com.cn:10443/', referrer: 'https://pmos.nx.sgcc.com.cn:10443/',
    contentType: 'text/html', userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };

  // 环境补全（AgentB）
  window.eval(`
    if (typeof Request === 'undefined') Request = function(url, opts) { this.url = url; this.method = (opts && opts.method) || 'GET'; this.headers = new Headers(); };
    if (typeof Response === 'undefined') Response = function(body, opts) { this.ok = true; this.status = 200; this.headers = new Headers(); };
    if (typeof Headers === 'undefined') Headers = function() { this._m = {}; this.append = function(k,v){this._m[k]=v;}; this.get = function(k){return this._m[k]||null;}; this.set = function(k,v){this._m[k]=v;}; this.has = function(k){return k in this._m;}; };
    if (typeof PointerEvent === 'undefined') PointerEvent = function(type, opts) { return new Event(type, opts); };
    if (typeof execScript === 'undefined') execScript = function(code) { try { eval(code); } catch(e) {} };
    if (typeof CollectGarbage === 'undefined') CollectGarbage = function() {};
    if (typeof globalStorage === 'undefined') globalStorage = {};
    try { if (typeof ActiveXObject === 'undefined') ActiveXObject = function() { throw new Error('not supported'); }; } catch(e) {}
  `);

  // 捕获 basearr
  const basearrs = [];
  const origPush = Array.prototype.push;
  Array.prototype.push = function (...args) {
    const r = origPush.apply(this, args);
    if (Array.isArray(this) && this.length >= 138 && this.length <= 152 && this.every(x => typeof x === 'number' && x >= 0 && x < 256)) {
      const arr = Array.from(this);
      if (!basearrs.some(b => b.length === arr.length && JSON.stringify(b) === JSON.stringify(arr))) {
        basearrs.push(arr);
      }
    }
    return r;
  };
  window.addEventListener('error', (e) => {
    console.log('[ERR]', e.message.substring(0, 100));
  });

  console.log('[1] 先跑挑战 js...');
  const chJs = fs.readFileSync(CHALLENGE_JS, 'utf8');
  try { window.eval(chJs); } catch (e) { console.log('挑战异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 6000));
  // 检查 $_ts 是否生成 aebi/scj
  try {
    const ts = window.eval('JSON.stringify({nsd:$_ts.nsd, aebi:$_ts.aebi, scj:$_ts.scj, lcd:typeof $_ts.lcd})');
    const td = JSON.parse(ts);
    console.log('挑战后 $_ts: aebi=' + JSON.stringify(td.aebi).substring(0, 60) + ' scj=' + JSON.stringify(td.scj).substring(0, 60));
  } catch (e) { console.log('$_ts 读取失败:', e.message.substring(0, 60)); }

  console.log('[2] 再跑应用 js...');
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  try { window.eval(appJs); } catch (e) { console.log('应用异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 20000));

  console.log('[3] basearr 捕获数:', basearrs.length);
  if (basearrs.length) {
    const last = basearrs[basearrs.length - 1];
    console.log('last len:', last.length, '[0-31]:', last.slice(0, 32).join(','));
    const samples = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
    const target = samples.find(s => s.src === 'mock');
    console.log('目标[0-31]:', target.basearr.slice(0, 32).join(','));
    const diffs = [];
    for (let i = 0; i < Math.min(last.length, target.basearr.length); i++) {
      if (last[i] !== target.basearr[i]) diffs.push(`${i}:${last[i]}→${target.basearr[i]}`);
    }
    console.log('差异:', diffs.length, diffs.slice(0, 40).join(' '));
  } else {
    console.log('[3] 未捕获 basearr');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
