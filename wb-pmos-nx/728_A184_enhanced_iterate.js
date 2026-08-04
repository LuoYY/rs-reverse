/**
 * 728_A184_enhanced_iterate.js
 * 增强迭代器：针对分层比较 dispatcher（_\$oX<=N），报错时定位 opcode 并把该分支语句替换为空
 * 正确 aebi（挑战 js）+ 属性名池 + 迭代
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
    console.log('aebi:', (td.aebi || []).map(g => (g || []).length).join(','));
  } catch (e) {}

  const env1 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env1.sandbox);
  try { vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), env1.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  let dynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('dynCode len:', dynCode.length);

  // 属性名池（浏览器权威）注入
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
  } catch (e) { console.log('池读取失败:', e.message.substring(0, 50)); }

  // 禁用集合：opcode 号（从已知卡点开始 + 自动迭代）
  const disabled = new Set(['229', '188', '322', '6', '272', '38', '162', '266', '169', '345', '82', '125']);
  const PREFIX = '(function(){ try { ';

  for (let round = 1; round <= 40; round++) {
    console.log(`\n=== 第 ${round} 轮 (disabled: ${[...disabled].join(',')}) ===`);
    let code = dynCode;
    // IIFE 顶部：预初始化池 + _\$lf + _\$_1
    code = code.split('(function(_$l9,_$_s){var _$a5=0;').join('(function(_$l9,_$_s){var _$a5=0;_$_1=new Proxy(window,{get:function(t,p,r){if(p===Symbol.toPrimitive)return undefined;if(p==="__proxy"||p==="__basearrs"||p==="__all")return Reflect.get(t,p,r);if(p in t)return Reflect.get(t,p,r);return __proxy();},set:function(t,p,v){t[p]=v;return true;},has:function(t,p){return true;}});_$lf=[];_$ke=Array;_$nc=String.fromCharCode;' + poolInit);
    code = code.split('_$_1=window;').join('_$_1=new Proxy(window,{get:function(t,p,r){if(p===Symbol.toPrimitive)return undefined;if(p==="__proxy"||p==="__basearrs"||p==="__all")return Reflect.get(t,p,r);if(p in t)return Reflect.get(t,p,r);return __proxy();},set:function(t,p,v){t[p]=v;return true;},has:function(t,p){return true;}});');
    // 禁用 opcode：把 _\$oX===N 分支的内容替换为空
    for (const op of disabled) {
      const re = new RegExp('_\\$oX===' + op + '\\)\\{[^{}]*\\}', 'g');
      code = code.replace(re, '_$oX===' + op + '){window.__skip=(window.__skip||0)+1;}');
      const re2 = new RegExp('_\\$[A-Za-z0-9_$]+===' + op + '\\)\\{[^{}]*\\}', 'g');
      code = code.replace(re2, (mm) => mm.replace(/\)\{[^)]*\{/, '){window.__skip2=(window.__skip2||0)+1;}'));
    }
    // 池赋值拦截（避免 opcode 224 用 undefined 覆盖注入池）
    const poolIdx = { '_$eF': 0, '_$kd': 1, '_$oV': 2, '_$nL': 3, '_$bu': 4, '_$dn': 5, '_$iQ': 6, '_$l5': 7 };
    for (const [sandboxPool, idx] of Object.entries(poolIdx)) {
      const from3 = sandboxPool + '=_$dU[' + idx + '];';
      const to3 = sandboxPool + '=((_$dU&&_$dU[' + idx + '])||' + sandboxPool + ');';
      code = code.split(from3).join(to3);
    }
    // while 计数
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
      window.__basearrs = [];
      var _origPush = Array.prototype.push;
      Array.prototype.push = function() {
        var r = _origPush.apply(this, arguments);
        try {
          if (Array.isArray(this) && this.length >= 130 && this.length <= 260 && typeof this[0] === 'number' && this[0] >= 0 && this[0] < 256) {
            var arr = Array.from(this);
            if (!window.__basearrs.some(function(b){return b.length === arr.length && b[0] === arr[0];})) {
              window.__basearrs.push(arr);
            }
          }
        } catch (e) {}
        return r;
      };
      window.__all = 0;
    `, sb);
    if (tsData && tsData !== 'null') {
      try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
    }
    const wrapped = PREFIX + code + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack) }; throw __e; } })()';
    const t0 = Date.now();
    try {
      vm.runInContext(wrapped, sb, { timeout: 45000, filename: 'wrap.js' });
      console.log('★ 运行完成!');
      const arrs = sb.window.__basearrs || [];
      console.log('捕获数组数:', arrs.length);
      for (const a of arrs) {
        console.log(`  len=${a.length} head=${a.slice(0, 8).join(',')} tail=${a.slice(-6).join(',')}`);
      }
      fs.writeFileSync('/tmp/nx_vm_basearrs_iter.json', JSON.stringify(arrs));
      process.exit(0);
    } catch (e) {
      console.log('运行失败:', e.message.substring(0, 100), '耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    // 定位报错
    try {
      const er = vm.runInContext('window.__err ? JSON.stringify(window.__err) : "no-err"', sb);
      if (er && er !== 'no-err') {
        const e2 = JSON.parse(er);
        const wm = (e2.stack || '').match(/wrap\.js:(\d+):(\d+)/);
        if (wm) {
          const line = +wm[1], col = +wm[2];
          const wrapLines = wrapped.split('\n');
          let absOff = 0;
          for (let i = 0; i < line - 1 && i < wrapLines.length; i++) absOff += wrapLines[i].length + 1;
          absOff += col - 1;
          const origOff = absOff - PREFIX.length;
          const ctx = code.substring(Math.max(0, origOff - 200), origOff + 100);
          console.log('报错 origOff=' + origOff);
          console.log('上下文:', ctx.substring(0, 250));
          // 定位 opcode：往回找 _\$oX===N
          const before = code.substring(Math.max(0, origOff - 600), origOff);
          const matches = [...before.matchAll(/_\$oX===(\d+)\)/g)];
          if (matches.length) {
            const op = matches[matches.length - 1][1];
            if (!disabled.has(op)) { console.log('★ 禁用 opcode:', op); disabled.add(op); }
            else console.log('opcode 已禁用:', op);
          }
          // 也检查其他 dispatcher
          const matches2 = [...before.matchAll(/_\$(\w+)===(\d+)\)/g)];
          if (matches2.length) {
            const last = matches2[matches2.length - 1];
            console.log('  dispatcher var:', last[1], 'op:', last[2]);
            if (!disabled.has(last[2])) { console.log('★ 禁用:', last[2]); disabled.add(last[2]); }
          }
        } else {
          console.log('stack:', (e2.stack || '').split('\n').slice(0, 4).join(' | '));
        }
      }
    } catch (e) { console.log('读 stack 失败:', e.message.substring(0, 60)); }
  }
  console.log('达到最大轮数');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
