/**
 * 728_A113_inject_name_maps.js
 * 注入浏览器权威的 10 个函数名映射（_\$n9:_\$aq 等）到 $_ts，跑应用 dynCode
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
  console.log('目标 basearr[25-28]:', target.basearr.slice(25, 29).join(','));

  // 挑战 js → $_ts
  const env0 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  try { vm.runInContext(fs.readFileSync(CHALLENGE_JS, 'utf8'), env0.sandbox, { timeout: 25000, filename: 'challenge.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  let tsData = 'null';
  try {
    const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify($_ts) : "null"', env0.sandbox);
    const td = JSON.parse(tsStr);
    if (td.aebi && Array.isArray(td.aebi)) {
      for (let i = 0; i < td.aebi.length; i++) {
        if (td.aebi[i] === undefined || td.aebi[i] === null) td.aebi[i] = [];
        else if (!Array.isArray(td.aebi[i])) td.aebi[i] = [td.aebi[i]];
      }
    }
    tsData = JSON.stringify(td);
  } catch (e) {}

  // 应用 js dynCode
  const env1 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env1.sandbox);
  try { vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), env1.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  const appDynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');

  // 浏览器权威 10 个函数名映射（来自 /tmp/nx_browser_ts_vars.json）
  // 注意：这是浏览器当前 nsd/cd 的映射，可能与 nsd=67402 不同（变量名是 nsd 相关）
  // 但尝试注入看效果
  const nameMaps = {
    '_$n9': '_$aq', '_$ix': '_$_8', '_$d_': '_$_y', '_$gb': '_$mX',
    '_$gu': '_$kx', '_$j6': '_$kc', '_$gk': '_$lZ', '_$mK': '_$_q',
    '_$eH': '_$fZ', '_$bX': '_$op',
  };

  const env = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  const sb = env.sandbox;
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
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
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
    window.__all = 0;
  `, sb);
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
  // 注入函数名映射
  const mapJs = Object.entries(nameMaps).map(([k, v]) => `window.$_ts['${k}']='${v}';`).join('');
  try { vm.runInContext(mapJs, sb); } catch (e) { console.log('注入映射失败:', e.message.substring(0, 80)); }
  try {
    const chk = vm.runInContext('JSON.stringify(Object.keys(window.$_ts))', sb);
    console.log('注入后 $_ts keys:', chk);
  } catch (e) {}

  console.log('[1] 跑应用 dynCode（注入函数名映射）...');
  try { vm.runInContext(appDynCode, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 8000));

  const basearrs = sb.window.__basearrs || [];
  console.log('[2] 捕获 basearr 数:', basearrs.length);
  if (basearrs.length) {
    const j = basearrs[basearrs.length - 1];
    console.log('vm basearr[0-31]:', j.slice(0, 32).join(','));
    console.log('vm basearr[25-28]:', j.slice(25, 29).join(','));
    console.log('浏览器 len:', target.basearr.length, 'vm len:', j.length);
    const diffs = [];
    for (let i = 0; i < Math.min(target.basearr.length, j.length); i++) {
      if (target.basearr[i] !== j[i]) diffs.push(`${i}:${target.basearr[i]}→${j[i]}`);
    }
    console.log('差异:', diffs.length, diffs.length ? diffs.slice(0, 40).join(' ') : '★★★ 完全一致！');
    fs.writeFileSync('/tmp/nx_vm_basearr_namemaps.json', JSON.stringify(j));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
