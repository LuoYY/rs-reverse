/**
 * 728_A112_challenge_full_ts.js
 * 用 561 框架（envIds=['2331'] + 自动迭代）跑挑战 js dynCode → 运行完成 → 提取完整 $_ts（含 10 个函数名映射）
 * 再注入应用 dynCode 跑 basearr
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

function applyPatches(runCode, envIds, safeCntRef, disabledOpcodes) {
  let code = runCode;
  const re69 = /!([_$\w]+)\?([_$\w]+)\+=-24:0;/;
  if (re69.test(code)) code = code.replace(re69, '!$1?($2+=0):0;');
  let sc = 0;
  code = code.replace(/!([_$\w]+)\[([_$\w]+)\[(\d+)\]\]/g, (mm, obj, arr, num) => {
    sc++;
    return '((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),!((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  let sc2 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\[(\d+)\]\](?![=(])/g, (mm, obj, arr, num) => {
    sc2++;
    return '=((window.__props=window.__props||[]).push((' + arr + ')[' + num + ']),((' + obj + ')&&(' + obj + ')[(' + arr + ')[' + num + ']]))';
  });
  let sc3 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)\]\[/g, (mm, x, y) => { sc3++; return '=((' + x + '[' + y + '])||__proxy())['; });
  let sc4 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([_$\w]+)-1\](?![=(])/g, (mm, x, y) => { sc4++; return '=((' + x + '[' + y + '-1])||__proxy())'; });
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[--([_$\w]+)\](?![=(])/g, (mm, x, y) => { sc4++; return '=((' + x + '[--' + y + '])||__proxy())'; });
  let sc5 = 0;
  code = code.replace(/(?<![=!<>])=([_$\w]+)\[([0-3])\](?![=(])/g, (mm, x, n) => { sc5++; return '=(((' + x + ')&&(' + x + ')[' + n + '])||__proxy())'; });
  let sc6 = 0;
  code = code.replace(/(function\s+([_$][\w$]*)\s*\(([_$][\w$]+),([_$][\w$]+),([_$][\w$]+),([_$][\w$]+)\)\{)([^]{0,250})/g, (mm, head, fn, p1, p2, p3, p4, body) => {
    if (!body.includes(p1 + '._') && !body.includes(p1 + '[')) return mm;
    sc6++;
    return head + 'if(' + p4 + '===void 0||' + p4 + '===null){' + p4 + '=[__proxy(),__proxy(),__proxy(),__proxy()];}' + body;
  });
  safeCntRef.sc = sc + '/' + sc2 + '/' + sc3 + '/' + sc4 + '/' + sc5 + '/' + sc6;
  let dc = 0;
  for (const op of disabledOpcodes) {
    const re = new RegExp('if\\(([_$\\w]+)===' + op + '\\)\\{[^{}]*\\}', 'g');
    code = code.replace(re, (mm, v) => { dc++; return 'if(' + v + '===' + op + '){}'; });
  }
  safeCntRef.dc = dc;
  let tc = 0;
  for (const id of envIds) {
    const re = new RegExp('([_$\\w]+)\\(' + id + '\\\\,', 'g');
    let out = '', last = 0, m;
    while ((m = re.exec(code)) !== null) {
      const openPos = code.indexOf('(', m.index + 1);
      let depth = 0, end = -1;
      for (let k = openPos; k < code.length; k++) {
        if (code[k] === '(') depth++;
        else if (code[k] === ')') { depth--; if (depth === 0) { end = k; break; } }
      }
      if (end < 0) break;
      out += code.slice(last, m.index) + 'true';
      last = end + 1;
      re.lastIndex = end + 1;
      tc++;
    }
    out += code.slice(last);
    code = out;
  }
  // 动态 hook 主 dispatcher
  let hc = 0;
  code = code.replace(/([_$][\w$]+)\(([_$][\w$]+),0,([_$][\w$]+)\.([_$][\w$]+)\.length,([_$][\w$]+)\)/g, (mm, fn, ctx, ctx2, prop, args) => {
    hc++;
    return 'window.__bcAll=(window.__bcAll||{});var __kk="' + prop + '";var __va=' + ctx + '.' + prop + ';var __arr=Array.isArray(__va)?__va:(typeof __va==="string"?[...__va].map(function(c){return c.charCodeAt(0);}):null);if(__arr&&!window.__bcAll[__kk]){window.__bcAll[__kk]={arr:__arr.slice(0,9000),len:__arr.length,fn:"' + fn + '"};}window.__bcAll.__cnt=(window.__bcAll.__cnt||{});window.__bcAll.__cnt[__kk]=(window.__bcAll.__cnt[__kk]||0)+1;window.__lastBC=__kk;' + fn + '(' + ctx + ',0,' + ctx2 + '.' + prop + '.length,' + args + ')';
  });
  safeCntRef.hc = hc;
  let gi = 0;
  code = code.replace(/while\(1\)\{/g, () => {
    gi++;
    return 'while(1){window.__w' + gi + '=(window.__w' + gi + '||0)+1;window.__lastW=' + gi + ';if(window.__all>12000000)throw new Error("ALL_LOOP_w' + gi + '");window.__all=(window.__all||0)+1;';
  });
  return { code, envTrue: tc };
}

async function runDynCode(dynCode, tsData, nsd, cd, opts) {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const envIds = new Set(opts.envIds || []);
  const disabledOpcodes = new Set(opts.disabledOpcodes || []);
  const safeCntRef = { sc: 0 };
  const PREFIX = '(function(){ try { ';
  for (let round = 1; round <= 30; round++) {
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
    if (tsData && tsData !== 'null') {
      try { vm.runInContext('window.$_ts = ' + tsData + ';', sb); } catch (e) {}
    }
    const { code: runCode } = applyPatches(dynCode, envIds, safeCntRef, disabledOpcodes);
    const wrapped = PREFIX + runCode + '; window.__dynOK = true; } catch(__e) { window.__err = { msg: String(__e.message), stack: String(__e.stack) }; throw __e; } })()';
    try {
      vm.runInContext(wrapped, sb, { timeout: 45000, filename: 'wrap.js' });
      return { ok: true, sandbox: sb, disabledOpcodes, envIds };
    } catch (e) {
      console.log(`  轮${round} 失败: ${e.message.substring(0, 80)}`);
    }
    // 提取错误
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
          const before = runCode.substring(Math.max(0, origOff - 400), origOff);
          const opMatches = [...before.matchAll(/===\s*(\d+)\)\{/g)];
          if (opMatches.length) {
            const lastOp = opMatches[opMatches.length - 1][1];
            if (!disabledOpcodes.has(lastOp)) { disabledOpcodes.add(lastOp); console.log(`  ★ 禁用 opcode: ${lastOp}`); }
          }
          // 环境 ID
          const ctx = runCode.substring(Math.max(0, origOff - 200), origOff + 60);
          const idM = ctx.match(/([_$]\w+)\((\d+),/);
          if (idM) {
            const id = idM[2];
            if (!envIds.has(id)) { envIds.add(id); console.log(`  ★ 环境 ID: ${id} (${idM[1]})`); }
          }
        }
      }
    } catch (e) {}
  }
  return { ok: false, disabledOpcodes, envIds };
}

(async () => {
  const { buildEnv } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));
  const raw = fs.readFileSync(path.join(ROOT, 'nx-mock/412.raw'), 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const nsd = +rawBody.match(/nsd=(\d+)/)[1];
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

  const samples = JSON.parse(fs.readFileSync('/tmp/nx_multi_nsd3.json', 'utf8'));
  const target = samples.find(s => s.src === 'mock');
  console.log('目标 basearr[25-28]:', target.basearr.slice(25, 29).join(','));

  // 步骤 1：挑战 js 外层 → dynCode + $_ts
  const env0 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env0.sandbox);
  try { vm.runInContext(fs.readFileSync(CHALLENGE_JS, 'utf8'), env0.sandbox, { timeout: 25000, filename: 'challenge.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  const chDynCode = env0.getDynCode();
  let tsData0 = 'null';
  try {
    const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify($_ts) : "null"', env0.sandbox);
    const td = JSON.parse(tsStr);
    if (td.aebi && Array.isArray(td.aebi)) {
      for (let i = 0; i < td.aebi.length; i++) {
        if (td.aebi[i] === undefined || td.aebi[i] === null) td.aebi[i] = [];
        else if (!Array.isArray(td.aebi[i])) td.aebi[i] = [td.aebi[i]];
      }
    }
    tsData0 = JSON.stringify(td);
    console.log('挑战 $_ts aebi:', (td.aebi || []).map(g => (g || []).length).join(','), 'keys:', Object.keys(td).join(','));
  } catch (e) {}
  console.log('挑战 dynCode len:', chDynCode ? chDynCode.length : '无');

  // 步骤 2：跑挑战 dynCode（迭代）直到完整 $_ts
  console.log('\n=== 跑挑战 dynCode（561 框架迭代） ===');
  const chResult = await runDynCode(chDynCode, tsData0, nsd, cd, { envIds: ['2331'], disabledOpcodes: [] });
  console.log('挑战 dynCode 结果:', chResult.ok ? '成功' : '失败', 'disOps:', [...chResult.disabledOpcodes].join(','));

  let fullTs = tsData0;
  if (chResult.ok) {
    try {
      const tsStr = vm.runInContext('typeof $_ts !== "undefined" ? JSON.stringify($_ts) : "null"', chResult.sandbox);
      const td = JSON.parse(tsStr);
      if (td.aebi && Array.isArray(td.aebi)) {
        for (let i = 0; i < td.aebi.length; i++) {
          if (td.aebi[i] === undefined || td.aebi[i] === null) td.aebi[i] = [];
          else if (!Array.isArray(td.aebi[i])) td.aebi[i] = [td.aebi[i]];
        }
      }
      fullTs = JSON.stringify(td);
      console.log('挑战 dynCode 后 $_ts keys:', Object.keys(td).join(','));
      console.log('aebi:', (td.aebi || []).map(g => (g || []).length).join(','));
      fs.writeFileSync('/tmp/nx_full_ts_challenge.json', fullTs);
    } catch (e) { console.log('提取完整 $_ts 失败:', e.message.substring(0, 80)); }
  }

  // 步骤 3：应用 js dynCode
  const env1 = buildEnv({ nsd, cd }, { target: NX_TARGET, ua: NX_UA, patchDyn: false });
  vm.runInContext(`
    window.__proxy = function() { return new Proxy(function(){}, { get:function(t,p){return window.__proxy();}, set:function(t,p,v){return true;}, apply:function(t,th,a){return window.__proxy();}, construct:function(t,a){return window.__proxy();} }); };
    __proxy = window.__proxy;
  `, env1.sandbox);
  try { vm.runInContext(fs.readFileSync(APP_JS, 'utf8'), env1.sandbox, { timeout: 30000, filename: 'app.js' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 3000));
  const appDynCode = env1.getDynCode() || fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  console.log('\n应用 dynCode len:', appDynCode.length);

  // 步骤 4：用完整 $_ts 跑应用 dynCode
  console.log('\n=== 跑应用 dynCode（完整 $_ts + basearr hook） ===');
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
  try { vm.runInContext('window.$_ts = ' + fullTs + ';', sb); } catch (e) { console.log('注入完整 $_ts 失败:', e.message.substring(0, 80)); }
  try { vm.runInContext(appDynCode, sb, { timeout: 45000, filename: 'appdyn.js' }); }
  catch (e) { console.log('应用 dynCode 异常:', e.message.substring(0, 100)); }
  await new Promise(r => setTimeout(r, 10000));

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
    fs.writeFileSync('/tmp/nx_vm_basearr_fullts.json', JSON.stringify(j));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
