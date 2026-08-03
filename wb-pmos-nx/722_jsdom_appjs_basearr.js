/**
 * 722_jsdom_appjs_basearr.js
 * jsdom 跑应用 js（Dl5ApMEho6Yq.2437991.js，basearr 在其 dynCode 生成）
 * 用固定 nsd/cd → 对比浏览器 basearr（721 样本）
 * 若匹配 → 纯算法打通！
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();

  // 从 721 样本取浏览器 basearr（mock nsd=67402）+ 从 412.raw 提取 cd
  const samples = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  const target = samples.find(s => s.src === 'mock') || samples[0];
  if (!target) { console.log('无样本'); process.exit(1); }
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const mm = rawBody.match(/nsd=(\d+);\$_ts\.cd="([^"]+)"/) || rawBody.match(/nsd=(\d+);\$_ts\.cd="([^"]+)"/) || rawBody.match(/nsd=(\d+);\$_ts\.cd=\"([^\"]+)\"/);
  const m2 = rawBody.match(/nsd=(\d+);\$_ts\.cd="([^"]+)"/) || rawBody.match(/nsd=(\d+);\$_ts\.cd=\\?\\?"([^\\"]+)"/);
  // 宽松匹配
  const nsdM = rawBody.match(/nsd=(\d+)/);
  const cdM = rawBody.match(/cd="([^"]+)"/);
  if (!nsdM || !cdM) { console.log('412.raw 提取 nsd/cd 失败'); process.exit(1); }
  const ts = { nsd: +nsdM[1], cd: cdM[1] };
  console.log('目标 nsd=' + ts.nsd + ' cd len=' + ts.cd.length);
  console.log('浏览器 basearr[0-31]:', target.basearr.slice(0, 32).join(','));
  console.log('浏览器 basearr[25-28]:', target.basearr.slice(25, 29).join(','));

  // jsdom 跑应用 js
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  console.log('应用 js len:', appJs.length);
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://pmos.nx.sgcc.com.cn:10443/', referrer: 'https://pmos.nx.sgcc.com.cn:10443/',
    contentType: 'text/html', userAgent: UA, runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts.nsd, cd: ts.cd };

  // 捕获 basearr（hook push）
  const basearrs = [];
  const origPush = Array.prototype.push;
  Array.prototype.push = function (...args) {
    const r = origPush.apply(this, args);
    if (Array.isArray(this) && this.length >= 138 && this.length <= 152 && this.every(x => typeof x === 'number' && x >= 0 && x < 256)) {
      const arr = Array.from(this);
      if (!basearrs.some(b => b.length === arr.length && JSON.stringify(b) === JSON.stringify(arr))) {
        basearrs.push(arr);
        if (basearrs.length <= 3) console.log('[JS] basearr len=' + arr.length + ' [0-31]:', arr.slice(0, 32).join(','));
      }
    }
    return r;
  };
  // cookie 捕获
  const cookiesWritten = [];
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });

  console.log('[1] eval 应用 js...');
  try { window.eval(appJs); } catch (e) { console.log('eval 异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 15000));
  console.log('[2] 捕获 basearr 数:', basearrs.length);
  console.log('[3] cookie 写入:', cookiesWritten.length, cookiesWritten.slice(0, 3));

  // 对比
  if (basearrs.length) {
    const j = basearrs[basearrs.length - 1];
    const b = target.basearr;
    console.log('\n=== 对比 ===');
    console.log('浏览器 len:', b.length, 'jsdom len:', j.length);
    const diffs = [];
    for (let i = 0; i < Math.min(b.length, j.length); i++) {
      if (b[i] !== j[i]) diffs.push(`${i}:${b[i]}→${j[i]}`);
    }
    console.log('差异:', diffs.length, diffs.length ? diffs.slice(0, 30).join(' ') : '★★★ 完全一致！');
    console.log('jsdom [25-28]:', j.slice(25, 29).join(','));
  } else {
    console.log('jsdom 未捕获 basearr——检查 eval 是否成功、是否生成了 dynCode');
    // 检查 dynCode
    try {
      const bd = await window.eval('window.__dyn ? "yes" : "no"');
      console.log('dynCode 存在:', bd);
    } catch (e) {}
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
