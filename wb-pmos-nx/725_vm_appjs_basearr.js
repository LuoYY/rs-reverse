/**
 * 725_vm_appjs_basearr.js
 * Node vm 沙箱跑应用 js（Dl5ApMEho6Yq）→ 生成 basearr → 对比浏览器（固定 nsd/cd）
 * basearr = f(nsd,cd) 纯函数（716/717 已证），若 vm 沙箱能复现 → 纯算法打通！
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const NX_TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

  // 固定 nsd/cd（412.raw）
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  console.log('nsd=' + nsd + ' cd len=' + cd.length);

  // 浏览器 basearr（721 mock 样本）
  const samples = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  const target = samples.find(s => s.src === 'mock');
  console.log('浏览器 basearr[0-31]:', target.basearr.slice(0, 32).join(','));
  console.log('浏览器 basearr[25-28]:', target.basearr.slice(25, 29).join(','));

  // Node vm 沙箱
  const env = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA });
  vm.runInContext(`
    if (typeof DataView !== 'undefined' && !DataView.prototype.getFloat16) {
      DataView.prototype.getFloat16 = function(byteOffset, littleEndian) {
        var u = this.getUint16(byteOffset, littleEndian);
        var sign = (u & 0x8000) ? -1 : 1;
        var exp = (u & 0x7c00) >> 10;
        var frac = u & 0x03ff;
        if (exp === 0) return sign * frac * Math.pow(2, -24);
        if (exp === 0x1f) return frac ? NaN : sign * Infinity;
        return sign * (1 + frac / 1024) * Math.pow(2, exp - 15);
      };
      DataView.prototype.setFloat16 = function(byteOffset, value, littleEndian) { this.setUint16(byteOffset, 0, littleEndian); };
    }
    window.DataView = DataView;
    window.__proxy = function() {
      return new Proxy(function(){}, {
        get: function(t, p) { return window.__proxy(); },
        set: function(t, p, v) { return true; },
        apply: function(t, thisArg, args) { return window.__proxy(); },
        construct: function(t, args) { return window.__proxy(); },
      });
    };
    __proxy = window.__proxy;
    // hook push 捕获 basearr
    window.__basearrs = [];
    var _origPush = Array.prototype.push;
    Array.prototype.push = function() {
      var r = _origPush.apply(this, arguments);
      if (Array.isArray(this) && this.length >= 130 && this.length <= 155 && this.every(function(x){return typeof x === 'number' && x >= 0 && x < 256;})) {
        var arr = Array.from(this);
        if (!window.__basearrs.some(function(b){return b.length === arr.length && JSON.stringify(b) === JSON.stringify(arr);})) {
          window.__basearrs.push(arr);
        }
      }
      return r;
    };
  `, env.sandbox);

  console.log('[1] 跑应用 js...');
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  let err = null;
  try { vm.runInContext(appJs, env.sandbox, { timeout: 20000, filename: 'app.js' }); } catch (e) { err = e; console.log('运行异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 10000));

  const basearrs = env.sandbox.window.__basearrs || [];
  console.log('[2] 捕获 basearr 数:', basearrs.length);
  if (basearrs.length) {
    const j = basearrs[basearrs.length - 1];
    const b = target.basearr;
    console.log('jsdom/vm basearr[0-31]:', j.slice(0, 32).join(','));
    console.log('jsdom/vm basearr[25-28]:', j.slice(25, 29).join(','));
    console.log('\n=== 对比 ===');
    console.log('浏览器 len:', b.length, 'vm len:', j.length);
    const diffs = [];
    for (let i = 0; i < Math.min(b.length, j.length); i++) {
      if (b[i] !== j[i]) diffs.push(`${i}:${b[i]}→${j[i]}`);
    }
    console.log('差异:', diffs.length, diffs.length ? diffs.slice(0, 40).join(' ') : '★★★ 完全一致！纯算法打通！');
  } else {
    console.log('[3] 未捕获 basearr');
    const cookies = env.sandbox.window.__cookies || [];
    console.log('cookie 写入:', cookies.length, cookies.slice(0, 3));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
