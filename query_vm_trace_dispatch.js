/**
 * query_vm_trace_dispatch.js — Hook VM dispatcher 追踪操作码执行
 *
 * 1. Pass 1: 执行动态代码，获取 trampoline 源码
 * 2. 从 trampoline 提取 dispatcher 函数名
 * 3. Pass 2: patch 动态代码，包裹 dispatcher 为 logging 版本
 * 4. 执行 patched 代码
 * 5. 调用 trampoline，收集操作码日志
 * 6. 分析日志找到跳过 query 生成的条件
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== Hook VM dispatcher 追踪操作码 ===\n');

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

  // ---- Pass 1: 获取 trampoline 源码 ----
  console.log('[Pass 1] 获取 trampoline...');
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  env1.sandbox.document = new Proxy(env1.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR1() {}
  RSXHR1.prototype = {
    open: function(m, u) { this._url = String(u); this.readyState = 1; },
    send: function() { this.readyState = 4; this.status = 200; this.responseText = '{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState: 0, status: 0, responseText: '', responseURL: '',
  };
  env1.sandbox.XMLHttpRequest = RSXHR1;

  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) dynCode = code;
    return origEval1.call(this, code);
  };

  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline 源码
  const xhr1 = new RSXHR1();
  RSXHR1.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) {
    if (k.startsWith('_$') && typeof xhr1[k] === 'function') {
      trampSrc = xhr1[k].toString();
      break;
    }
  }
  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 提取 dispatcher 和 ctx 变量名
  const callMatch = trampSrc.match(/,0,([^( )]+)\.([^( )]+)\.length,([^( )]+)\)/);
  if (!callMatch) { console.log('No VM call in trampoline'); process.exit(1); }

  const ctxVar = callMatch[1];
  const bcProp = callMatch[2];
  const argsVar = callMatch[3];

  // 找到 dispatcher 函数名（在 ,0, 之前的函数调用）
  const dispMatch = trampSrc.match(new RegExp('([^( )]+)\\(' + ctxVar.replace(/\$/g, '\\$') + ',0,'));
  const dispName = dispMatch ? dispMatch[1] : null;

  console.log('VM context:', ctxVar);
  console.log('Bytecode prop:', bcProp);
  console.log('Dispatcher:', dispName);
  console.log('Args:', argsVar);

  // ---- Pass 2: patch 动态代码 ----
  console.log('\n[Pass 2] Patch 动态代码...');

  if (!dynCode) { console.log('No dynamic code'); process.exit(1); }

  // 1. 用赋值表达式替换 ctx 变量（dump VM 上下文）
  const ctxSearchStr = ',0,' + ctxVar + '.';
  const ctxPos = dynCode.indexOf(ctxSearchStr);
  if (ctxPos < 0) { console.log('VM call not found in dyn code'); process.exit(1); }

  // 找到 ( 前面
  let parenPos = ctxPos;
  while (parenPos > 0 && dynCode[parenPos] !== '(') parenPos--;
  const ctxStart = parenPos + 1;
  const ctxEnd = ctxStart + ctxVar.length;

  let patchedCode = dynCode;
  if (patchedCode.substring(ctxStart, ctxEnd) === ctxVar) {
    patchedCode = patchedCode.substring(0, ctxStart) + '(window.__vmCtx=' + ctxVar + ')' + patchedCode.substring(ctxEnd);
    console.log('Patched VM ctx dump');
  }

  // 2. 包裹 dispatcher 函数为 logging 版本
  if (dispName) {
    // 找到 dispatcher 函数定义: function dispName(...)
    const dispDefStr = 'function ' + dispName + '(';
    const dispDefPos = patchedCode.indexOf(dispDefStr);
    if (dispDefPos >= 0) {
      // 在函数定义前插入 logging wrapper
      // 创建一个 wrapper: var origDisp = dispName; dispName = function(...args) { window.__vmLog.push(args[0]); return origDisp.apply(this, args); };
      // 但这需要 dispatcher 已经定义
      // 更好的方法: 在 dispatcher 函数体开头插入 logging

      // 找到函数体的第一个 {
      let bracePos = patchedCode.indexOf('{', dispDefPos);
      if (bracePos >= 0) {
        // 在函数体开头插入 logging
        const logCode = 'if(!window.__vmLog)window.__vmLog=[];window.__vmLog.push({pc:arguments[0],bcLen:arguments[2]});';
        patchedCode = patchedCode.substring(0, bracePos + 1) + logCode + patchedCode.substring(bracePos + 1);
        console.log('Patched dispatcher logging');
      }
    }
  }

  // ---- Pass 3: 执行 patched 代码 ----
  console.log('\n[Pass 3] 执行 patched 代码...');
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = { ...RSXHR1.prototype };
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let patched = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !patched) {
      patched = true;
      return origEval2.call(this, patchedCode);
    }
    return origEval2.call(this, code);
  };

  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 检查 VM 上下文
  const hasCtx = vm.runInContext('typeof window.__vmCtx', env2.proxied);
  console.log('VM ctx:', hasCtx);

  // 清空 log
  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  console.log('\n触发 trampoline...');
  const xhr2 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) {
    if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true;
  }
  let tramp2 = null;
  for (const k in xhr2) {
    if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; }
  }

  if (tramp2) {
    const result = tramp2.call(xhr2, '{}');
    console.log('Result:', typeof result, '=', String(result).substring(0, 80));

    // 检查 VM log
    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log('\nVM log entries:', logLen);

    if (logLen > 0) {
      // 显示前 20 条日志
      const log = vm.runInContext('JSON.stringify(window.__vmLog.slice(0, 20))', env2.proxied);
      console.log('First 20:', log?.substring(0, 500));

      // 显示最后 10 条
      const tail = vm.runInContext('JSON.stringify(window.__vmLog.slice(-10))', env2.proxied);
      console.log('Last 10:', tail?.substring(0, 300));

      // 分析 pc 值
      const pcs = vm.runInContext('window.__vmLog.map(function(e){return e.pc})', env2.proxied);
      console.log('\nPC values:', JSON.stringify(pcs));
      console.log('PC range:', Math.min(...pcs), '-', Math.max(...pcs));
      console.log('Unique PCs:', [...new Set(pcs)].length);
    }
  } else {
    console.log('No trampoline found');
  }

  // 保存 VM 上下文和 bytecode
  if (hasCtx !== 'undefined') {
    const keys = vm.runInContext('Object.keys(window.__vmCtx)', env2.proxied);
    const ctxData = {};
    for (const k of keys) {
      ctxData[k] = vm.runInContext('window.__vmCtx["' + k + '"]', env2.proxied);
    }
    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/vm-context-full.json'),
      JSON.stringify({ ctxData, keys, vmLog: vm.runInContext('window.__vmLog || []', env2.proxied), nsd, cd, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log('\nVM context + log saved');
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
