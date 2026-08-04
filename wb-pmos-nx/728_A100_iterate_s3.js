/**
 * 728_A100_iterate_s3.js
 * 正确 aebi + 完整迭代：主入口 _\$_s[3]（顶层 while）逐轮禁用报错 opcode
 * 关键：迭代 _\$_s[3] dispatcher 的 _\$\$b opcode（用 ===N){ 模式提取）
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
  let dynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('dynCode len:', dynCode.length);

  const disabledOpcodes = new Set();
  const safeCntRef = { sc: 0 };
  const PREFIX = '(function(){ try { ';

  for (let round = 1; round <= 25; round++) {
    console.log(`\n=== 第 ${round} 轮（disabled: ${[...disabledOpcodes].join(',')}） ===`);
    let code = dynCode;
    // 禁用 opcode（_$$b===N 模式，覆盖 _$_s[3] dispatcher）
    let dc = 0;
    for (const op of disabledOpcodes) {
      const re = new RegExp('if\\(([_$\\w]+)===' + op + '\\)\\{[^{}]*\\}', 'g');
      code = code.replace(re, (mm, v) => { dc++; return 'if(' + v + '===' + op + '){}'; });
    }
    // 全局 while 计数（限制死循环）
    let gi = 0;
    code = code.replace(/while\(1\)\{/g, () => {
      gi++;
      return 'while(1){window.__all=(window.__all||0)+1;if(window.__all>8000000)throw new Error("ALL_LOOP_w' + gi + '");';
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
    if (tsData && tsData !== 'null') {
      try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
    }
    const wrapped = PREFIX + code + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack) }; throw __e; } })()';
    const t0 = Date.now();
    try {
      vm.runInContext(wrapped, sb, { timeout: 45000, filename: 'wrap.js' });
      console.log('★ 运行完成!');
      const basearrs = sb.window.__basearrs || [];
      console.log('捕获 basearr 数:', basearrs.length);
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
        fs.writeFileSync('/tmp/nx_vm_basearr_s3.json', JSON.stringify(j));
      }
      process.exit(0);
    } catch (e) {
      console.log('运行失败:', e.message.substring(0, 100), '耗时:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
    // 提取报错 opcode
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
          const ctx = code.substring(Math.max(0, origOff - 150), origOff + 80);
          console.log('报错位置 origOff=' + origOff);
          console.log('上下文:', ctx.substring(0, 230));
          const before = code.substring(Math.max(0, origOff - 400), origOff);
          const opMatches = [...before.matchAll(/===\s*(\d+)\)\{/g)];
          if (opMatches.length) {
            const lastOp = opMatches[opMatches.length - 1][1];
            if (!disabledOpcodes.has(lastOp)) { console.log('★ 禁用 opcode:', lastOp); disabledOpcodes.add(lastOp); }
            else console.log('opcode 已禁用:', lastOp);
          }
          // 也尝试找 _\$lf 初始化 opcode（267 相关）
          const lfM = ctx.match(/_\$lf\[(\d+)\]/);
          if (lfM) console.log('_\$lf 索引:', lfM[1]);
        } else {
          console.log('stack:', (e2.stack || '').split('\n').slice(0, 4).join(' | '));
        }
      }
    } catch (e) { console.log('读 stack 失败:', e.message.substring(0, 60)); }
  }
  console.log('达到最大轮数');
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
