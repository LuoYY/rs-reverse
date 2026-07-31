/**
 * query_decompile.js — 反编译当前会话 bytecode
 *
 * 已知：case N 是操作码表（46 个操作码）
 * bytecode 114 元素，76 valid / 37 invalid
 * invalid 是 vm-call 的入口 pc 参数
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 反编译 bytecode ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const env = buildEnv({ nsd, cd }, { seedCookie: oCookie });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m,u) { this._url=String(u); this.readyState=1; },
    send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState:0, status:0, responseText:'', responseURL:'',
  };
  env.sandbox.XMLHttpRequest = RSXHR;

  let dynCode = null;
  const origEval = env.sandbox.eval;
  env.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 1. 提取 case N 操作码 + handler
  console.log('[Step 1] 提取操作码 handler...');
  const casePattern = /case\s+(\d+):\s*([^;]+);/g;
  const opHandlers = {};
  let match;
  while ((match = casePattern.exec(dynCode)) !== null) {
    const op = parseInt(match[1]);
    if (!opHandlers[op]) {
      opHandlers[op] = match[2].trim().substring(0, 120);
    }
  }
  console.log(`Extracted ${Object.keys(opHandlers).length} opcodes`);

  // 2. 加载 bytecode
  const bcData = JSON.parse(fs.readFileSync(path.join(ROOT, 'output/capture-20080/vm-context-full.json'), 'utf8'));
  const bytecode = bcData.ctxData._$fB;
  console.log(`Bytecode: ${bytecode.length} elements`);

  // 3. 反编译
  console.log('\n[Step 2] 反编译...');
  let pc = 0;
  let step = 0;
  const lines = [];

  while (pc < bytecode.length && step < 300) {
    const op = bytecode[pc];

    // 检查是否是有效操作码
    if (typeof op === 'string') {
      lines.push(`[${pc}] STR: "${op}"`);
      pc++;
      step++;
      continue;
    }

    const handler = opHandlers[String(op)];
    if (!handler) {
      // 可能是操作数（vm-call 入口 pc）
      lines.push(`[${pc}] DATA: ${op} (operand)`);
      pc++;
      step++;
      continue;
    }

    // 分类
    let cat = '';
    if (handler.includes('return')) cat = 'RETURN';
    else if (handler.includes('switch')) cat = 'SWITCH';
    else if (handler.includes('push')) cat = 'PUSH';
    else if (handler.includes('^=')) cat = 'XOR';
    else if (handler.includes('===')) cat = 'CMP';
    else if (handler.includes('apply') || handler.includes('call')) cat = 'CALL';
    else if (handler.includes('new ')) cat = 'NEW';

    lines.push(`[${pc}] op${op} ${cat}: ${handler.substring(0, 80)}`);

    if (cat === 'RETURN') {
      lines.push('  === END ===');
      break;
    }

    pc++;
    step++;
  }

  // 输出反编译结果
  console.log('\n=== 反编译结果 ===');
  lines.forEach(l => console.log(l));

  // 4. 分析条件分支
  console.log('\n=== 条件分支分析 ===');
  // 找到所有条件跳转
  // 在 RS VM 中，条件跳转可能是：
  // case N: _$pc += (cond ? offset : 0)
  // 或 if(cond) _$pc = target

  // 搜索 handler 中的跳转模式
  Object.entries(opHandlers).forEach(([op, handler]) => {
    if (handler.includes('_$cq') && (handler.includes('+=') || handler.includes('='))) {
      console.log(`  op${op}: ${handler.substring(0, 80)}`);
    }
  });

  // 5. 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/bytecode-decompiled.txt'),
    lines.join('\n')
  );
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/current-opcode-handlers.json'),
    JSON.stringify({ nsd, cd, opcodes: opHandlers, bytecode, timestamp: new Date().toISOString() }, null, 2)
  );
  console.log('\nSaved');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
