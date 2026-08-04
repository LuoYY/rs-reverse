/**
 * 728_A105_inject_pools.js
 * 从浏览器权威（/tmp/nx_browser_pools2.json）采集属性名池（196 元素数组），注入沙箱 $_ts
 * 跑应用 dynCode 验证 basearr
 * 浏览器池：_\$b1, _\$oU, _\$_L, _\$lc, _\$lC, _\$\$M, _\$oP, _\$\$q (196 元素属性名池)
 * 沙箱对应：_\$eF, _\$kd, _\$oV, _\$nL, _\$bu, _\$dn, _\$iQ, _\$l5
 * 注入方式：$_ts.cp = [pool0, pool1, ...]，并在 dynCode 前把 window.$_ts[0..7] 指向池
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

  // 浏览器权威池
  const browserPools = JSON.parse(fs.readFileSync('/tmp/nx_browser_pools2.json', 'utf8'));
  const poolNames = ['_$b1', '_$oU', '$_L', '_$lc', '_$lC', '$$M', '_$oP', '$$q'];
  // 实际 key：_\$b1, _\$oU, _\$_L, _\$lc, _\$lC, _\$\$M, _\$oP, _\$\$q
  const bPoolArr = [
    browserPools.pools['_$b1'],
    browserPools.pools['_$oU'],
    browserPools.pools['_$_L'],
    browserPools.pools['_$lc'],
    browserPools.pools['_$lC'],
    browserPools.pools['_$$M'],
    browserPools.pools['_$oP'],
    browserPools.pools['_$$q'],
  ].map(s => JSON.parse(s));
  console.log('浏览器池长度:', bPoolArr.map(a => a.length).join(','));

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
  let dynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('dynCode len:', dynCode.length);

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
  // 注入 $_ts + 浏览器池
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
  const poolJs = 'window.$_ts[0]=' + JSON.stringify(bPoolArr[0]) + ';window.$_ts[1]=' + JSON.stringify(bPoolArr[1]) + ';window.$_ts[2]=' + JSON.stringify(bPoolArr[2]) + ';window.$_ts[3]=' + JSON.stringify(bPoolArr[3]) + ';window.$_ts[4]=' + JSON.stringify(bPoolArr[4]) + ';window.$_ts[5]=' + JSON.stringify(bPoolArr[5]) + ';window.$_ts[6]=' + JSON.stringify(bPoolArr[6]) + ';window.$_ts[7]=' + JSON.stringify(bPoolArr[7]) + ';window.$_ts.cp=[' + JSON.stringify(bPoolArr[0]) + ',' + JSON.stringify(bPoolArr[1]) + ',' + JSON.stringify(bPoolArr[2]) + ',' + JSON.stringify(bPoolArr[3]) + ',' + JSON.stringify(bPoolArr[4]) + ',' + JSON.stringify(bPoolArr[5]) + ',' + JSON.stringify(bPoolArr[6]) + ',' + JSON.stringify(bPoolArr[7]) + '];';
  try { vm.runInContext(poolJs, sb); } catch (e) { console.log('注入池失败:', e.message.substring(0, 80)); }

  console.log('[1] 跑应用 dynCode（注入浏览器池）...');
  try { vm.runInContext(dynCode, sb, { timeout: 45000, filename: 'appdyn.js' }); }
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
    fs.writeFileSync('/tmp/nx_vm_basearr_injected.json', JSON.stringify(j));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
