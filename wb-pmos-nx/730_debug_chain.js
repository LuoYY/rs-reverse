/**
 * 730_debug_chain.js
 * 调试完整链路：挑战 js 后 $_ts 状态、aebi/scj、dynCode
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

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://pmos.nx.sgcc.com.cn:10443/', referrer: 'https://pmos.nx.sgcc.com.cn:10443/',
    contentType: 'text/html', userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };

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

  // cookie 捕获
  const cookies = [];
  let jar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return jar; },
    set(v) { cookies.push(v.split(';')[0]); jar = jar ? jar + '; ' + v : v; },
    configurable: true,
  });
  window.addEventListener('error', (e) => console.log('[ERR]', e.message.substring(0, 100)));

  console.log('[1] 跑挑战 js...');
  const chJs = fs.readFileSync(CHALLENGE_JS, 'utf8');
  try { window.eval(chJs); } catch (e) { console.log('挑战异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 8000));
  console.log('[2] cookies:', cookies.slice(0, 3));
  try {
    const tsStr = window.eval('(function(){var o={};for(var k in $_ts){try{o[k]=typeof $_ts[k];}catch(e){o[k]="?";}}return JSON.stringify(o);})()');
    console.log('[2] $_ts 字段类型:', tsStr);
    const aebi = window.eval('$_ts.aebi ? JSON.stringify($_ts.aebi) : "no-aebi"');
    console.log('[2] aebi:', String(aebi).substring(0, 80));
    const scj = window.eval('$_ts.scj ? JSON.stringify($_ts.scj) : "no-scj"');
    console.log('[2] scj:', String(scj).substring(0, 80));
    const lcd = window.eval('typeof $_ts.lcd');
    console.log('[2] lcd:', lcd);
  } catch (e) { console.log('[2] $_ts 读失败:', e.message.substring(0, 60)); }

  console.log('[3] 跑应用 js...');
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  try { window.eval(appJs); } catch (e) { console.log('应用异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 15000));
  console.log('[4] 应用后 cookies:', cookies.slice(0, 4));
  try {
    const aebi2 = window.eval('$_ts.aebi ? JSON.stringify($_ts.aebi) : "no-aebi"');
    console.log('[4] 应用后 aebi:', String(aebi2).substring(0, 80));
  } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
