/**
 * 728_A88_env_patches.js
 * 综合环境补丁：_\$lf 数组兜底 + window[属性][属性] 双层访问兜底 + _\$s[0] dispatcher 入口初始化
 * 正确 aebi（挑战 js）+ 完整补丁跑应用 dynCode
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
    console.log('$_ts aebi:', (td.aebi || []).map(g => (g || []).length).join(','));
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

  // ===== 综合补丁 =====
  let p = 0;
  // 1. _\$s[0] dispatcher 入口初始化 _\$lf=[]
  let code = dynCode;
  let c1 = code;
  code = code.split(',_$bi=_$_s[0];while(1){_$oX=_$bi[_$jc++];').join(',_$bi=_$_s[0];_$lf=[];_$eF=[];_$kd=[];_$oV=[];_$nL=[];_$bu=[];_$dn=[];_$iQ=[];_$l5=[];while(1){_$oX=_$bi[_$jc++];');
  if (code !== c1) p++;
  // 2. 所有属性名池读取兜底：_$X[_$pool[N]] 读取时为 undefined 兜底
  // 3. window[属性][属性] 双层访问兜底
  // 针对已知报错模式做正则：_$ga=(...(_$_1)[(_$eF)[110]])[_$eF[26]] 形式
  let c3 = code;
  code = code.replace(/(\(\w*_\$[A-Za-z0-9_$]*\[\(_?_\$[A-Za-z0-9_$]*\)\[(\d+)\]\]\))\(\[(_?_\$[A-Za-z0-9_$]*)\[(\d+)\]\]\)/g, (mm, inner, n1, pool, n2) => {
    p++;
    return '(((' + inner + ')&&(' + inner + ')[(' + pool + ')[' + n2 + ']])||__proxy())';
  });
  // 更通用：_$xx=_$yy[_$pool[N]][_$pool2[M]] 兜底
  let c4 = code;
  code = code.replace(/([_\$][\w$]*)=([_\$][\w$]*)\[([_\$][\w$]*)\[(\d+)\]\]\[([_\$][\w$]*)\[(\d+)\]\]/g, (mm, dst, obj, pool1, n1, pool2, n2) => {
    p++;
    return dst + '=(((' + obj + ')&&(' + obj + ')[(' + pool1 + ')[' + n1 + ']])||__proxy())[(' + pool2 + ')[' + n2 + ']]';
  });
  if (code !== c4) p++;
  // 4. _\$lf[N] 读取兜底（_$lf 已是 []，undefined 访问不报错；但后续 _\$lf[N][X] 会报）
  // 5. 禁用已知卡住 opcode
  console.log('补丁命中:', p);

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
  console.log('[1] 跑应用 dynCode（综合补丁）...');
  try { vm.runInContext(code, sb, { timeout: 45000, filename: 'appdyn.js' }); }
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
    fs.writeFileSync('/tmp/nx_vm_basearr_envpatched.json', JSON.stringify(j));
  } else {
    // 错误堆栈定位
    try {
      const wrapped = '(function(){try{' + code + ';}catch(__e){window.__err={msg:String(__e.message),stack:String(__e.stack)};throw __e;}})()';
      const sb2 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false }).sandbox;
      vm.runInContext(`window.__proxy=function(){return new Proxy(function(){},{});};__proxy=window.__proxy;window.__all=0;`, sb2);
      try { vm.runInContext('window.$_ts = ' + tsData + ';', sb2); } catch (e) {}
      try { vm.runInContext(wrapped, sb2, { timeout: 45000, filename: 'wrap.js' }); } catch (e) {}
      const er = vm.runInContext('window.__err ? JSON.stringify(window.__err) : "no"', sb2);
      if (er && er !== 'no') {
        const e2 = JSON.parse(er);
        const wm = (e2.stack || '').match(/wrap\.js:(\d+):(\d+)/);
        if (wm) {
          const line = +wm[1], col = +wm[2];
          const wrapLines = wrapped.split('\n');
          let absOff = 0;
          for (let i = 0; i < line - 1 && i < wrapLines.length; i++) absOff += wrapLines[i].length + 1;
          absOff += col - 1;
          const origOff = absOff - '(function(){try{'.length;
          console.log('报错位置 origOff=' + origOff);
          console.log('上下文:', code.substring(Math.max(0, origOff - 150), origOff + 80));
        }
      }
    } catch (e) {}
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
