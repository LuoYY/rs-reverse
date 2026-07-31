/**
 * query_extract_opcodes.js — 从当前会话动态代码提取操作码表
 *
 * 1. 沙箱执行动态代码
 * 2. 找到 VM dispatcher 函数
 * 3. 从二叉 if 树提取操作码 → handler 映射
 * 4. 反编译 trampoline bytecode
 * 5. 找到跳过 query 生成的条件分支
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 从当前会话提取操作码表 ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  // Pass 1: 执行动态代码，获取 trampoline + 动态代码源码
  const env1 = buildEnv({ nsd, cd }, { seedCookie: oCookie });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m, u) { this._url = String(u); this.readyState = 1; },
    send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState: 0, status: 0, responseText: '', responseURL: '',
  };
  env1.sandbox.XMLHttpRequest = RSXHR;

  let dynCode = null;
  const origEval = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  if (!dynCode) { console.log('No dynamic code'); process.exit(1); }
  console.log(`Dynamic code: ${dynCode.length} chars`);

  // 获取 trampoline 源码
  const xhr1 = new RSXHR();
  RSXHR.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampSrc = xhr1[k].toString(); break; } }
  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 提取 dispatcher 函数名
  const idx0 = trampSrc.indexOf(',0,');
  let p = idx0; while (p > 0 && trampSrc[p] !== '(') p--;
  let fnStart = p - 1; while (fnStart >= 0 && /[_$a-zA-Z0-9]/.test(trampSrc[fnStart])) fnStart--;
  const dispName = trampSrc.substring(fnStart + 1, p);
  const ctxVar = trampSrc.substring(p + 1, idx0);
  const bcProp = trampSrc.substring(idx0).match(/\.([^( ]+)\.length/)[1];
  const argsVar = trampSrc.substring(idx0).match(/length,([^( )]+)\)/)[1];

  console.log(`Dispatcher: ${dispName}`);
  console.log(`Ctx: ${ctxVar}, Prop: .${bcProp}, Args: ${argsVar}`);

  // 在动态代码中找到 dispatcher 函数定义
  const dispDef = `function ${dispName}(`;
  const dispPos = dynCode.indexOf(dispDef);
  if (dispPos < 0) { console.log('Dispatcher not found in dyn code'); process.exit(1); }
  console.log(`Dispatcher at pos ${dispPos}`);

  // 提取 dispatcher 函数体
  let braceStart = dynCode.indexOf('{', dispPos);
  let depth = 0;
  let braceEnd = braceStart;
  while (braceEnd < dynCode.length) {
    if (dynCode[braceEnd] === '{') depth++;
    if (dynCode[braceEnd] === '}') depth--;
    if (depth === 0) break;
    braceEnd++;
  }
  const dispBody = dynCode.substring(braceStart + 1, braceEnd);
  console.log(`Dispatcher body: ${dispBody.length} chars`);

  // 从二叉 if 树提取操作码
  // 模式: if(_$xx===N){handler}
  // 或: else if(_$xx===N){handler}
  const opPattern = new RegExp(dispName.replace(/\$/g, '\\$') + '|(_\\$[a-zA-Z0-9]+)===?(\\d+)', 'g');
  // 实际上操作码比较模式可能是 _$xx<N 或 _$xx===N
  // 先搜索 ===N 模式
  
  // 搜索所有 ===数字 的比较
  const comparisons = [];
  let match;
  const compPattern = /===?\s*(\d+)/g;
  while ((match = compPattern.exec(dispBody)) !== null) {
    comparisons.push({ pos: match.index, val: parseInt(match[1]) });
  }
  console.log(`\nFound ${comparisons.length} ===N comparisons`);

  // 也搜索 <N 比较（二叉 if 树的分界点）
  const ltPattern = /<\s*(\d+)/g;
  const lessThans = [];
  while ((match = ltPattern.exec(dispBody)) !== null) {
    lessThans.push({ pos: match.index, val: parseInt(match[1]) });
  }
  console.log(`Found ${lessThans.length} <N comparisons`);

  // 提取操作码值（===N 中的 N）
  const opValues = [...new Set(comparisons.map(c => c.val))].sort((a, b) => a - b);
  console.log(`\nOpcode values (${opValues.length}): ${opValues.join(', ')}`);

  // 提取每个操作码的 handler
  // handler 在 ===N 后面的 {handler} 中
  const opHandlers = {};
  for (const comp of comparisons) {
    const opVal = comp.val;
    if (opHandlers[opVal]) continue; // 只取第一个

    // 从 comp.pos 向后找 {handler}
    let bracePos = dispBody.indexOf('{', comp.pos);
    if (bracePos < 0 || bracePos > comp.pos + 20) continue;

    let d = 0;
    let end = bracePos;
    while (end < dispBody.length) {
      if (dispBody[end] === '{') d++;
      if (dispBody[end] === '}') d--;
      if (d === 0) break;
      end++;
    }
    const handler = dispBody.substring(bracePos + 1, end).trim();
    opHandlers[opVal] = handler.substring(0, 100);
  }

  console.log(`\nExtracted ${Object.keys(opHandlers).length} opcodes`);
  Object.entries(opHandlers).slice(0, 20).forEach(([op, handler]) => {
    console.log(`  op${op}: ${handler.substring(0, 60)}`);
  });

  // 保存操作码表
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/current-session-opcodes.json'),
    JSON.stringify({
      nsd, cd,
      dispName, ctxVar, bcProp, argsVar,
      opcodes: opHandlers,
      opcodeValues: opValues,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\nOpcodes saved');

  // 用新操作码表反编译 bytecode
  console.log('\n=== 反编译 bytecode ===');
  
  // 获取 bytecode
  const hasCtx = vm.runInContext('typeof window.__vmCtx', env1.proxied);
  // 需要从 Pass 2 获取 bytecode（patch eval）
  // 但这里直接用之前保存的 bytecode
  const bcData = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/capture-20080/vm-context-full.json'), 'utf8'));
  const bytecode = bcData.ctxData._$fB || bcData.ctxData._$ay || bcData.ctxData._$g4;
  if (!bytecode) { console.log('No bytecode'); process.exit(1); }

  console.log(`Bytecode: ${bytecode.length} elements`);

  // 反编译
  let pc = 0;
  let step = 0;
  while (pc < bytecode.length && step < 200) {
    const op = bytecode[pc];
    const handler = opHandlers[String(op)];

    if (!handler) {
      console.log(`[${pc}] UNKNOWN op=${op}`);
      pc++;
      step++;
      continue;
    }

    // 简单分类
    let cat = '';
    if (handler.includes('return ')) cat = 'RETURN';
    else if (handler.includes('+=') && handler.includes('?')) cat = 'JUMP';
    else if (handler.includes('push')) cat = 'PUSH';
    else if (handler.includes('^=')) cat = 'XOR';
    else if (handler.includes('===')) cat = 'CMP';

    console.log(`[${pc}] op${op} ${cat}`);
    console.log(`     ${handler.substring(0, 80)}`);

    if (cat === 'RETURN') {
      console.log('     === END ===');
      break;
    }

    pc++;
    step++;
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
