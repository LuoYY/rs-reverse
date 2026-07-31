/**
 * query_args5_trace.js — 方向1: 追踪 args[5] 变化
 *
 * 在 dispatcher 调用前后记录 args[5] 的值
 * 找到哪次调用设置了 args[5] = ""
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== 方向1: 追踪 args[5] 变化 ===\n');

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

  // ---- Pass 1: 获取 trampoline + 动态代码 ----
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
  // 关键：在 dispatcher 调用前后记录 args[5] 的值
  // 替换: DISP(ctx,0,ctx.prop.length,args)
  // 为: (window.__vmLog=window.__vmLog||[]).push({before:typeof argsVar[5]==='string'?argsVar[5].substring(0,30):String(argsVar[5]),pc:0}),DISP(...),(window.__vmLog=window.__vmLog||[]).push({after:typeof argsVar[5]==='string'?argsVar[5].substring(0,30):String(argsVar[5])})

  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = dynCode.indexOf(callPattern);
  console.log(`Call pattern at: ${callPos}`);

  if (callPos < 0) { console.log('Pattern not found'); process.exit(1); }

  // 构造 logging 包装
  // before: 记录 args[5] 调用前的值
  // after: 记录 args[5] 调用后的值
  const beforeLog = `(window.__vmLog=window.__vmLog||[]).push({t:'b',a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])}),`;
  const afterLog = `,(window.__vmLog=window.__vmLog||[]).push({t:'a',a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])})`;

  let patched = dynCode.substring(0, callPos) + beforeLog + callPattern + afterLog + dynCode.substring(callPos + callPattern.length);

  // 也 dump ctx
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
  console.log('Patched args[5] logging');

  // ---- Pass 3: 执行 patched ----
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
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 清空 log
  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  console.log('触发 trampoline...');
  const xhr2 = new env2.sandbox.XMLHttpRequest();
  env2.sandbox.XMLHttpRequest.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  if (tramp2) {
    const result = tramp2.call(xhr2, '{}');
    console.log(`Result: "${String(result).substring(0, 80)}"`);

    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log(`Log entries: ${logLen}`);

    if (logLen > 0) {
      // 保存完整日志
      const fullLog = vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied);
      const log = JSON.parse(fullLog);

      fs.writeFileSync(path.join(ROOT, 'output/capture-20080/vm-args5-log.json'), JSON.stringify(log, null, 2));
      console.log('Log saved to vm-args5-log.json');

      // 分析：找到 args[5] 从非空变为空的调用
      console.log('\n=== args[5] 变化追踪 ===');
      for (let i = 0; i < log.length; i++) {
        const entry = log[i];
        const a5 = entry.a5 || 'undef';
        const a4 = entry.a4 || 'undef';
        const label = entry.t === 'b' ? 'BEFORE' : 'AFTER ';
        // 只显示有变化的条目
        if (i > 0) {
          const prev = log[i - 1];
          if (prev.a5 === a5 && prev.a4 === a4) continue; // 跳过无变化的
        }
        console.log(`  [${i}] ${label} a4=${a4} a5="${a5}"`);
      }

      // 特别关注：最后一次 AFTER 调用（最终返回值）
      const lastAfter = log.filter(e => e.t === 'a').pop();
      console.log(`\n=== 最终返回 ===`);
      console.log(`  args[4] (exit code): ${lastAfter?.a4}`);
      console.log(`  args[5] (return val): "${lastAfter?.a5}"`);

      // 找到 args[5] 第一次变成 "" 的调用
      const firstEmpty = log.find(e => e.t === 'a' && (e.a5 === '' || e.a5 === 'undef'));
      if (firstEmpty) {
        const idx = log.indexOf(firstEmpty);
        console.log(`\n=== args[5] 首次为空 ===`);
        console.log(`  Entry #${idx}: ${JSON.stringify(firstEmpty)}`);
        // 显示前后的条目
        if (idx > 0) console.log(`  Prev #${idx - 1}: ${JSON.stringify(log[idx - 1])}`);
        if (idx < log.length - 1) console.log(`  Next #${idx + 1}: ${JSON.stringify(log[idx + 1])}`);
      }

      // 统计 args[5] 的不同值
      const a5Values = {};
      log.filter(e => e.t === 'a').forEach(e => {
        const v = e.a5 || 'undef';
        a5Values[v] = (a5Values[v] || 0) + 1;
      });
      console.log(`\n=== args[5] 值分布 ===`);
      Object.entries(a5Values).forEach(([v, count]) => {
        console.log(`  "${v.substring(0, 50)}": ${count} times`);
      });
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
