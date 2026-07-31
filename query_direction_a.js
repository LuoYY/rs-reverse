/**
 * query_direction_a.js — 方向A: 追踪 VM 寄存器
 *
 * Patch dispatcher 的 while 循环，在每次操作码执行后 dump 寄存器
 * 找到 query 加密时使用的密钥
 *
 * 策略：
 * 1. 执行动态代码，获取 dispatcher 函数源码
 * 2. 找到 while(1) 循环中的操作码分发
 * 3. 在每次操作码 handler 后插入寄存器 dump
 * 4. 触发 trampoline，收集寄存器变化
 * 5. 在密文出现前后找到密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== 方向A: 追踪 VM 寄存器 ===\n');

  const ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

  function makeRSXHR() {
    function RSXHR() {}
    RSXHR.prototype = {
      open: function(m, u) { this._url = String(u); this.readyState = 1; },
      send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
      setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
      getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
      addEventListener: function() {}, removeEventListener: function() {},
      readyState: 0, status: 0, responseText: '', responseURL: '',
    };
    return RSXHR;
  }
  function lockCookie(env, sc) {
    env.sandbox.document = new Proxy(env.sandbox.document, {
      get(t, p) { if (p === 'cookie') return sc; return t[p]; },
      set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
    });
  }

  // Pass 1: 获取 trampoline + 动态代码
  console.log('[Pass 1] 获取 trampoline...');
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  lockCookie(env1, seedCookie);
  env1.sandbox.XMLHttpRequest = makeRSXHR();

  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  const xhr1 = new env1.sandbox.XMLHttpRequest();
  env1.sandbox.XMLHttpRequest.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampSrc = xhr1[k].toString(); break; } }
  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 提取 dispatcher 和 ctx
  const idx0 = trampSrc.indexOf(',0,');
  let p = idx0; while (p > 0 && trampSrc[p] !== '(') p--;
  let fnStart = p - 1; while (fnStart >= 0 && /[_$a-zA-Z0-9]/.test(trampSrc[fnStart])) fnStart--;
  const dispName = trampSrc.substring(fnStart + 1, p);
  const ctxVar = trampSrc.substring(p + 1, idx0);
  const propMatch = trampSrc.substring(idx0).match(/\.([^( ]+)\.length/);
  const bcProp = propMatch ? propMatch[1] : null;
  const argsVar = trampSrc.substring(idx0).match(/length,([^( )]+)\)/)[1];

  console.log(`Dispatcher: ${dispName}, Ctx: ${ctxVar}, Prop: .${bcProp}, Args: ${argsVar}`);

  // 找到 dispatcher 函数定义
  const dispDef = `function ${dispName}(`;
  const dispPos = dynCode.indexOf(dispDef);
  if (dispPos < 0) { console.log('Dispatcher not found'); process.exit(1); }

  // 找到 dispatcher 函数体
  let braceStart = dynCode.indexOf('{', dispPos);
  let depth = 0;
  let braceEnd = braceStart;
  while (braceEnd < dynCode.length) {
    if (dynCode[braceEnd] === '{') depth++;
    if (dynCode[braceEnd] === '}') depth--;
    if (depth === 0) break;
    braceEnd++;
  }
  const dispBody = dynCode.substring(braceStart, braceEnd + 1);
  console.log(`Dispatcher body: ${dispBody.length} chars`);

  // 找到 while(1) 循环
  const whileIdx = dispBody.indexOf('while(1)');
  if (whileIdx < 0) { console.log('while(1) not found'); process.exit(1); }
  console.log(`while(1) at offset ${whileIdx} in dispatcher body`);

  // 找到 while 循环体
  let whileBraceStart = dispBody.indexOf('{', whileIdx);
  let whileDepth = 0;
  let whileBraceEnd = whileBraceStart;
  while (whileBraceEnd < dispBody.length) {
    if (dispBody[whileBraceEnd] === '{') whileDepth++;
    if (dispBody[whileBraceEnd] === '}') whileDepth--;
    if (whileDepth === 0) break;
    whileBraceEnd++;
  }
  const whileBody = dispBody.substring(whileBraceStart + 1, whileBraceEnd);
  console.log(`While body: ${whileBody.length} chars`);

  // 找到取指操作: pc=bytecode[pc++]
  // 模式: _$xx=_$yy[_$zz++]
  const fetchPattern = /(_\$[a-zA-Z0-9]+)=(_\$[a-zA-Z0-9]+)\[(_\$[a-zA-Z0-9]+)\+\+\]/g;
  const fetchMatch = whileBody.match(fetchPattern);
  if (fetchMatch) {
    console.log(`\nFetch patterns: ${fetchMatch.length}`);
    fetchMatch.slice(0, 3).forEach(f => console.log(`  ${f}`));
  }

  // 策略：在 while 循环开头插入寄存器 dump
  // 不 dump 所有寄存器（太多），只 dump 变化的值
  // 改为：在 while 循环开头记录 pc 和 args[5]
  const pcVarMatch = whileBody.match(/(_\$[a-zA-Z0-9]+)\+\+/);
  const pcVar = pcVarMatch ? pcVarMatch[1] : null;
  console.log(`\nPC variable: ${pcVar}`);

  // Pass 2: patch 动态代码
  // 在 dispatcher 的 while 循环开头插入 logging
  // 记录每次操作码执行时的 pc 值和 args[5] 值
  console.log('\n[Pass 2] Patch dispatcher...');

  let patched = dynCode;

  // 1. ctx dump（在 dispatcher 调用处）
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = patched.indexOf(callPattern);
  if (callPos >= 0) {
    let pp = callPos; while (pp > 0 && patched[pp] !== '(') pp--;
    const cs = pp + 1, ce = cs + ctxVar.length;
    if (patched.substring(cs, ce) === ctxVar) {
      patched = patched.substring(0, cs) + `(window.__vmCtx=${ctxVar})` + patched.substring(ce);
    }
  }

  // 2. 在 while 循环开头插入 logging
  // 用绝对位置（patched 代码中）
  const patchedDispPos = patched.indexOf(dispDef);
  const patchedWhileIdx = patched.indexOf('while(1)', patchedDispPos);
  const patchedWhileBrace = patched.indexOf('{', patchedWhileIdx);

  // 插入 logging：记录 pc 和 args[5]
  if (pcVar && argsVar) {
    const logCode = `if(!window.__vmPcLog)window.__vmPcLog=[];window.__vmPcLog.push({pc:${pcVar},a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,80):String(${argsVar}[5]).substring(0,80)});if(window.__vmPcLog.length>5000)window.__vmPcLog=[];`;
    patched = patched.substring(0, patchedWhileBrace + 1) + logCode + patched.substring(patchedWhileBrace + 1);
    console.log('Patched while loop logging');
  }

  // Pass 3: 执行 patched
  console.log('\n[Pass 3] 执行 patched...');
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  lockCookie(env2, seedCookie);
  env2.sandbox.XMLHttpRequest = makeRSXHR();

  const origEval2 = env2.sandbox.eval;
  let patched2 = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !patched2) { patched2 = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 60000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 清空 log
  vm.runInContext('window.__vmPcLog = []', env2.proxied);

  // 触发 trampoline
  console.log('触发 trampoline...');
  const xhr2 = new env2.sandbox.XMLHttpRequest();
  env2.sandbox.XMLHttpRequest.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  if (tramp2) {
    const result = tramp2.call(xhr2, '{}');
    console.log(`Result: "${String(result).substring(0, 40)}"`);

    const logLen = vm.runInContext('window.__vmPcLog ? window.__vmPcLog.length : 0', env2.proxied);
    console.log(`PC log entries: ${logLen}`);

    if (logLen > 0) {
      // 保存完整日志
      const fullLog = JSON.parse(vm.runInContext('JSON.stringify(window.__vmPcLog)', env2.proxied));
      fs.writeFileSync(path.join(ROOT, 'output/capture-20080/vm-pc-log.json'), JSON.stringify(fullLog, null, 2));
      console.log('PC log saved');

      // 分析：找到 args[5] 从 "" 变为非空的位置（或反过来）
      console.log('\n=== args[5] 变化点 ===');
      let changes = [];
      for (let i = 1; i < fullLog.length; i++) {
        if (fullLog[i].a5 !== fullLog[i - 1].a5 && fullLog[i].a5 !== 'undef' && fullLog[i - 1].a5 !== 'undef') {
          changes.push({ idx: i, pc: fullLog[i].pc, from: fullLog[i - 1].a5.substring(0, 30), to: fullLog[i].a5.substring(0, 30) });
        }
      }
      console.log(`Changes: ${changes.length}`);
      changes.slice(0, 20).forEach(c => {
        console.log(`  [${c.idx}] pc=${c.pc} "${c.from}" → "${c.to}"`);
      });

      // 找到包含逗号分隔数字的 args[5]（字节数组）
      console.log('\n=== 字节数组出现点 ===');
      let byteArrays = [];
      for (let i = 0; i < fullLog.length; i++) {
        const a5 = fullLog[i].a5;
        if (a5.indexOf(',') >= 0 && a5.length > 10) {
          const parts = a5.split(',');
          let valid = true;
          for (const p of parts) {
            const n = parseInt(p.trim());
            if (isNaN(n) || n < 0 || n > 255) { valid = false; break; }
          }
          if (valid && parts.length >= 8) {
            byteArrays.push({ idx: i, pc: fullLog[i].pc, len: parts.length, val: a5.substring(0, 60) });
          }
        }
      }
      console.log(`Byte arrays: ${byteArrays.length}`);
      byteArrays.forEach(b => console.log(`  [${b.idx}] pc=${b.pc} len=${b.len} val=${b.val}`));

      // PC 分布
      const pcs = fullLog.map(e => e.pc);
      const uniquePcs = [...new Set(pcs)];
      console.log(`\nUnique PCs: ${uniquePcs.length}`);
      console.log(`PC range: ${Math.min(...pcs)} - ${Math.max(...pcs)}`);
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
