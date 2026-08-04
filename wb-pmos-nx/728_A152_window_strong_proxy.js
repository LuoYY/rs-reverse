/**
 * 728_A152_window_strong_proxy.js
 * 在 dynCode 运行前，把沙箱 window 全局替换为强 Proxy（缺失属性返回 __proxy）
 * + 寄存器预初始化 + 属性名池注入 + _\$_1 Proxy
 * 目标：让 VM 环境检测全部通过，推进到 basearr/base 生成
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

  const env1 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env1.sandbox);
  try { vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), env1.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  let dynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');

  let poolInit = '';
  try {
    const browserPools = JSON.parse(fs.readFileSync('/tmp/nx_browser_pools2.json', 'utf8'));
    const poolMap = [
      ['_$eF', '_$b1'], ['_$kd', '_$oU'], ['_$oV', '_$_L'], ['_$nL', '_$lc'],
      ['_$bu', '_$lC'], ['_$dn', '_$$M'], ['_$iQ', '_$oP'], ['_$l5', '_$$q'],
    ];
    for (const [sandboxPool, browserPool] of poolMap) {
      const val = browserPools.pools[browserPool];
      if (val) poolInit += sandboxPool + '=' + JSON.stringify(JSON.parse(val)) + ';';
    }
  } catch (e) {}

  let code = dynCode;
  // IIFE 顶部：window 强 Proxy + 寄存器 + 池
  code = code.split('(function(_$l9,_$_s){var _$a5=0;').join('(function(_$l9,_$_s){var _$a5=0;' +
    'var __realWin=window;var __mkP=function(){return new Proxy(function(){},{get:function(t,p){if(p===Symbol.toPrimitive)return undefined;return __mkP();},set:function(){return true;},apply:function(){return __mkP();},construct:function(){return __mkP();}});};' +
    'var __strongWin=new Proxy(__realWin,{get:function(t,p,r){if(p===Symbol.toPrimitive)return undefined;var v=Reflect.get(t,p,r);if(v!==undefined)return v;if(p==="__proxy"||p==="__basearrs"||p==="__caps"||p==="__all")return undefined;return __mkP();},set:function(t,p,v){t[p]=v;return true;},has:function(t,p){return true;}});' +
    'window=__strongWin;globalThis=__strongWin;self=__strongWin;top=__strongWin;parent=__strongWin;' +
    '_$_1=__strongWin;_$lf=[];' + poolInit);
  code = code.split('_$_1=window;').join('_$_1=window;');
  const poolIdx = { '_$eF': 0, '_$kd': 1, '_$oV': 2, '_$nL': 3, '_$bu': 4, '_$dn': 5, '_$iQ': 6, '_$l5': 7 };
  for (const [sandboxPool, idx] of Object.entries(poolIdx)) {
    const from3 = sandboxPool + '=_$dU[' + idx + '];';
    const to3 = sandboxPool + '=((_$dU&&_$dU[' + idx + '])||' + sandboxPool + ');';
    code = code.split(from3).join(to3);
  }
  let gi = 0;
  code = code.replace(/while\(1\)\{/g, () => {
    gi++;
    return 'while(1){window.__all=(window.__all||0)+1;if(window.__all>10000000)throw new Error("ALL_LOOP_w' + gi + '");';
  });

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
    window.__caps = {};
    var _origPush = Array.prototype.push;
    Array.prototype.push = function() {
      var r = _origPush.apply(this, arguments);
      try {
        if (Array.isArray(this) && this.length >= 130 && this.length <= 260 && typeof this[0] === 'number' && this[0] >= 0 && this[0] < 256) {
          var a = Array.from(this);
          var k = a.length + '_' + a[0];
          if (!window.__caps[k]) window.__caps[k] = a;
        }
      } catch (e) {}
      return r;
    };
    window.__all = 0;
  `, sb);
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
  console.log('[1] 跑应用 dynCode（window 强 Proxy）...');
  const t0 = Date.now();
  try { vm.runInContext(code, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 100), '耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's'); }
  await new Promise(r => setTimeout(r, 8000));
  try {
    const caps = vm.runInContext('JSON.stringify(Object.keys(window.__caps))', sb);
    console.log('[2] 捕获数组 keys:', caps);
    if (caps && caps !== '[]') {
      const arrs = vm.runInContext('JSON.stringify(Object.values(window.__caps).map(a=>({len:a.length,head:a.slice(0,16),tail:a.slice(-6)})))', sb);
      console.log('[3] 捕获详情:', arrs);
    }
  } catch (e) { console.log('读 caps 失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
