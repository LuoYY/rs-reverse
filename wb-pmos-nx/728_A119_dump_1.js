/**
 * 728_A119_dump_1.js
 * 在报错前 dump _\$_1 的类型和关键属性
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

  // 属性名池注入
  const browserPools = JSON.parse(fs.readFileSync('/tmp/nx_browser_pools2.json', 'utf8'));
  const poolMap = [
    ['_$eF', '_$b1'], ['_$kd', '_$oU'], ['_$oV', '_$_L'], ['_$nL', '_$lc'],
    ['_$bu', '_$lC'], ['_$dn', '_$$M'], ['_$iQ', '_$oP'], ['_$l5', '_$$q'],
  ];
  const poolValues = {};
  for (const [sandboxPool, browserPool] of poolMap) {
    const val = browserPools.pools[browserPool];
    if (val) poolValues[sandboxPool] = JSON.parse(val);
  }
  let code = dynCode;
  const t1 = '(function(_$l9,_$_s){var _$a5=0;';
  const poolInit = Object.entries(poolValues).map(([k, v]) => `${k}=` + JSON.stringify(v) + ';').join('');
  const r1 = '(function(_$l9,_$_s){var _$a5=0;_$lf=[];' + poolInit;
  code = code.split(t1).join(r1);
  const poolIdx = { '_$eF': 0, '_$kd': 1, '_$oV': 2, '_$nL': 3, '_$bu': 4, '_$dn': 5, '_$iQ': 6, '_$l5': 7 };
  for (const [sandboxPool, idx] of Object.entries(poolIdx)) {
    const from3 = sandboxPool + '=_$dU[' + idx + '];';
    const to3 = sandboxPool + '=((_$dU&&_$dU[' + idx + '])||' + sandboxPool + ');';
    code = code.split(from3).join(to3);
  }
  // 在 opcode 322 前插桩 dump _\$_1
  code = code.split('_$lf[51]=_$_1[_$oV[38]];').join('(window.__d1=(window.__d1||[]),window.__d1.push(JSON.stringify({t1type:typeof _$_1,t1Str:String(_$_1).substring(0,80),oV38:(_$oV&&_$oV[38])?_$oV[38]:null,hasOnice:typeof _$_1!=="undefined"&&_$_1!==null?(typeof _$_1["onicecandidate"]):"n/a"})),window.__d1.length>10&&window.__d1.shift(),_$lf[51]=_$_1[_$oV[38]]);');
  console.log('插桩:', code.includes('__d1'));

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
    window.__all = 0;
  `, sb);
  try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
  try { vm.runInContext(code, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('运行异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 3000));
  try {
    const d = vm.runInContext('window.__d1 ? JSON.stringify(window.__d1) : "no"', sb);
    console.log('\n=== _\$_1 dump ===');
    console.log(d === 'no' ? '未执行' : JSON.stringify(JSON.parse(d), null, 1));
  } catch (e) { console.log('读失败:', e.message.substring(0, 80)); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
