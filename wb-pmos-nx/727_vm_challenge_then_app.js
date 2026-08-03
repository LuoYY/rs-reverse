/**
 * 727_vm_challenge_then_app.js
 * Node vm 沙箱顺序跑：挑战 js → 应用 js → 捕获 basearr（对比浏览器）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CHALLENGE_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const APP_JS = path.join(ROOT, 'nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js');
const NX_TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

  const samples = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  const target = samples.find(s => s.src === 'mock');
  console.log('浏览器 basearr[25-28]:', target.basearr.slice(25, 29).join(','));
  console.log('浏览器 basearr[0-31]:', target.basearr.slice(0, 32).join(','));

  const env = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA });
  const sb = env.sandbox;
  vm.runInContext(`
    window.DataView = DataView;
    if (!DataView.prototype.getFloat16) {
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
    window.__proxy = function() {
      return new Proxy(function(){}, {
        get: function(t, p) { return window.__proxy(); },
        set: function(t, p, v) { return true; },
        apply: function(t, thisArg, args) { return window.__proxy(); },
        construct: function(t, args) { return window.__proxy(); },
      });
    };
    __proxy = window.__proxy;
    window.__basearrs = [];
    var _origPush = Array.prototype.push;
    Array.prototype.push = function() {
      var r = _origPush.apply(this, arguments);
      if (Array.isArray(this) && this.length >= 130 && this.length <= 155 && this.every(function(x){return typeof x === 'number' && x >= 0 && x < 256;})) {
        var arr = Array.from(this);
        if (!window.__basearrs.some(function(b){return b.length === arr.length && JSON.stringify(b) === JSON.stringify(arr);})) {
          window.__basearrs.push(arr);
          if (window.__basearrs.length <= 5) window.__basearrLog = (window.__basearrLog||[]).concat([arr.slice(0, 20)]);
        }
      }
      return r;
    };
  `, sb);

  console.log('[1] 跑挑战 js...');
  const chJs = fs.readFileSync(CHALLENGE_JS, 'utf8');
  try { vm.runInContext(chJs, sb, { timeout: 25000, filename: 'challenge.js' }); } catch (e) { console.log('挑战异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 8000));
  console.log('[1] cookies:', (sb.window.__cookies || []).length);
  const cookies = sb.window.__cookies || [];
  console.log('[1] 前2 cookie:', cookies.slice(0, 2));

  console.log('[2] 跑应用 js...');
  const appJs = fs.readFileSync(APP_JS, 'utf8');
  try { vm.runInContext(appJs, sb, { timeout: 25000, filename: 'app.js' }); } catch (e) { console.log('应用异常:', e.message.substring(0, 120)); }
  await new Promise(r => setTimeout(r, 15000));

  const basearrs = sb.window.__basearrs || [];
  console.log('[3] 捕获 basearr 数:', basearrs.length);
  if (basearrs.length) {
    const j = basearrs[basearrs.length - 1];
    const b = target.basearr;
    console.log('vm basearr[0-31]:', j.slice(0, 32).join(','));
    console.log('vm basearr[25-28]:', j.slice(25, 29).join(','));
    console.log('\n=== 对比 ===');
    console.log('浏览器 len:', b.length, 'vm len:', j.length);
    const diffs = [];
    for (let i = 0; i < Math.min(b.length, j.length); i++) {
      if (b[i] !== j[i]) diffs.push(`${i}:${b[i]}→${j[i]}`);
    }
    console.log('差异:', diffs.length, diffs.length ? diffs.slice(0, 40).join(' ') : '★★★ 完全一致！纯算法打通！');
  } else {
    console.log('[3] 未捕获 basearr');
    console.log('[3] 全部 cookies:', (sb.window.__cookies || []).slice(0, 5));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
