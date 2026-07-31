/**
 * query_vm_full_trace.js — 完整 VM 追踪 + 保存日志
 * 
 * 三 pass 方案：
 * 1. 执行动态代码，获取 trampoline 源码
 * 2. patch 动态代码（ctx dump + dispatcher call logging）
 * 3. 执行 patched 代码，调用 trampoline，保存完整日志
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== 完整 VM 追踪 ===\n');

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

  function lockCookie(env, seedCookie) {
    env.sandbox.document = new Proxy(env.sandbox.document, {
      get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
      set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
    });
  }

  // ---- Pass 1: 获取 trampoline ----
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
  for (const k in xhr1) {
    if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampSrc = xhr1[k].toString(); break; }
  }
  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 提取变量名
  const idx = trampSrc.indexOf(',0,');
  let p = idx; while (p > 0 && trampSrc[p] !== '(') p--;
  let fnStart = p - 1; while (fnStart >= 0 && /[_$a-zA-Z0-9]/.test(trampSrc[fnStart])) fnStart--;
  const dispName = trampSrc.substring(fnStart + 1, p);
  const ctxVar = trampSrc.substring(p + 1, idx);
  const propMatch = trampSrc.substring(idx).match(/\.([^( ]+)\.length/);
  const bcProp = propMatch ? propMatch[1] : null;
  const argsMatch = trampSrc.substring(idx).match(/length,([^( )]+)\)/);
  const argsVar = argsMatch ? argsMatch[1] : null;

  console.log(`Dispatcher: ${dispName}, Ctx: ${ctxVar}, Prop: .${bcProp}, Args: ${argsVar}`);

  // ---- Pass 2: patch 动态代码 ----
  console.log('\n[Pass 2] Patch...');
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = dynCode.indexOf(callPattern);
  console.log(`Call pattern at: ${callPos}`);

  if (callPos < 0) { console.log('Pattern not found'); process.exit(1); }

  // 在调用前插入 logging（轻量版）
  const logExpr = `(window.__vmLog=window.__vmLog||[]).push(1),`;
  let patched = dynCode.substring(0, callPos) + logExpr + callPattern + dynCode.substring(callPos + callPattern.length);

  // 也 dump ctx 变量
  const ctxSearch = `,0,${ctxVar}.`;
  const ctxPos = patched.indexOf(ctxSearch, callPos);
  if (ctxPos >= 0) {
    let pp = ctxPos; while (pp > 0 && patched[pp] !== '(') pp--;
    const cs = pp + 1, ce = cs + ctxVar.length;
    if (patched.substring(cs, ce) === ctxVar) {
      patched = patched.substring(0, cs) + `(window.__vmCtx=${ctxVar})` + patched.substring(ce);
      console.log('Patched ctx dump');
    }
  }
  console.log('Patched dispatcher logging');

  // ---- Pass 3: 执行 patched ----
  console.log('\n[Pass 3] 执行 patched...');
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  lockCookie(env2, seedCookie);
  env2.sandbox.XMLHttpRequest = makeRSXHR();

  const origEval2 = env2.sandbox.eval;
  let patched2 = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !patched2) {
      patched2 = true;
      return origEval2.call(this, patched);
    }
    return origEval2.call(this, code);
  };

  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 清空 log
  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  console.log('\n触发 trampoline...');
  const xhr2 = new env2.sandbox.XMLHttpRequest();
  env2.sandbox.XMLHttpRequest.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  if (tramp2) {
    const result = tramp2.call(xhr2, '{}');
    console.log(`Result: "${String(result).substring(0, 80)}"`);

    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log(`VM log entries: ${logLen}`);

    if (logLen > 0) {
      // 保存完整日志
      const fullLog = vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied);
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/vm-dispatch-log.json'),
        JSON.stringify(JSON.parse(fullLog), null, 2)
      );
      console.log('Full log saved to vm-dispatch-log.json');

      // 分析日志
      const log = JSON.parse(fullLog);
      console.log(`\n=== 日志分析 ===`);

      // 显示每次调用的 pc 和 state
      log.forEach((entry, i) => {
        const state = entry.ctx ? Object.entries(entry.ctx).find(([k, v]) => typeof v === 'number') : null;
        const stateStr = state ? `${state[0]}=${state[1]}` : 'N/A';
        const bcLen = entry.len || (entry.ctx ? Object.values(entry.ctx).find(v => Array.isArray(v) && v.length > 10)?.length : 0) || 0;
        console.log(`  [${i}] pc=${entry.pc} len=${entry.len || bcLen} state=${stateStr}`);
      });

      // 检查最后一次调用的 args（返回值）
      const lastEntry = log[log.length - 1];
      if (lastEntry && lastEntry.args) {
        console.log('\n=== 最后一次调用的 args ===');
        console.log(`  args[4] (exit code): ${lastEntry.args[4]}`);
        console.log(`  args[5] (return value): ${JSON.stringify(lastEntry.args[5])?.substring(0, 100)}`);
      }

      // 检查第一次调用的 bytecode
      const firstEntry = log[0];
      if (firstEntry && firstEntry.ctx) {
        const bc = Object.values(firstEntry.ctx).find(v => Array.isArray(v) && v.length > 10);
        if (bc) {
          console.log(`\n=== 第一次调用的 bytecode (${bc.length} elements) ===`);
          console.log(`  ${JSON.stringify(bc)}`);
        }
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
