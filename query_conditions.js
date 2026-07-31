/**
 * query_conditions.js — 逐个分析条件检查
 *
 * 从 args5 trace 中找到 args[5] 从非空变为 "" 的位置
 * 然后分析该位置的条件检查
 *
 * 方法论（来自 COOKIE-EXPLORATION.md）：
 * 1. 逐层对比，不假设
 * 2. 找到关键条件并满足它
 * 3. 用纯算法重现
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 逐个分析条件检查 ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  // 获取管线 cookie
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  // Pass 1: 获取 trampoline + 动态代码
  console.log('[Pass 1] 获取 trampoline...');
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  env1.sandbox.document = new Proxy(env1.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR() {}
  RSXHR.prototype = {
    open: function(m,u) { this._url=String(u); this.readyState=1; },
    send: function() { this.readyState=4; this.status=200; this.responseText='{}'; },
    setRequestHeader: function() {}, abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function() {}, removeEventListener: function() {},
    readyState:0, status:0, responseText:'', responseURL:'',
  };
  env1.sandbox.XMLHttpRequest = RSXHR;
  let dynCode = null;
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline + 提取 dispatcher 变量名
  const xhr1 = new RSXHR();
  RSXHR.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampSrc = xhr1[k].toString(); break; } }

  // 用修复的正则提取（支持 _$$ 变量名）
  const callMatch = trampSrc.match(/(_\$[$a-zA-Z0-9]+)\((_\$[$a-zA-Z0-9]+),0,\2\.(_\$[$a-zA-Z0-9]+)\.length/);
  if (!callMatch) { console.log('No call in trampoline'); process.exit(1); }
  const dispName = callMatch[1], ctxVar = callMatch[2], bcProp = callMatch[3], argsVar = trampSrc.match(/length,(_\$[$a-zA-Z0-9]+)\)/)[1];
  console.log(`Dispatcher: ${dispName}, Ctx: ${ctxVar}, BC: ${bcProp}, Args: ${argsVar}`);

  // Pass 2: patch + args5 trace
  console.log('\n[Pass 2] Patch args5 trace...');
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length`;
  const callPos = dynCode.indexOf(callPattern);
  if (callPos < 0) { console.log('Call not found'); process.exit(1); }

  // 在调用后插入 args5 logging
  const afterLog = `,(window.__vmLog=window.__vmLog||[]).push({a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])})`;
  let patched = dynCode.substring(0, callPos) + callPattern + afterLog + dynCode.substring(callPos + callPattern.length);

  // ctx dump
  const cs = callPos + dispName.length + 1;
  const ce = cs + ctxVar.length;
  if (patched.substring(cs, ce) === ctxVar) {
    patched = patched.substring(0, cs) + `(window.__vmCtx=${ctxVar})` + patched.substring(ce);
  }

  // Pass 3: 执行 patched
  console.log('[Pass 3] 执行 patched...');
  const env2 = buildEnv({ nsd, cd }, { seedCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let patched2 = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !patched2) { patched2 = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 清空 log
  vm.runInContext('window.__vmLog = []', env2.proxied);

  // 触发 trampoline
  const xhr2 = new RSXHR2();
  RSXHR2.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') xhr2[k] = true; }
  let tramp2 = null;
  for (const k in xhr2) { if (k.startsWith('_$') && typeof xhr2[k] === 'function') { tramp2 = xhr2[k]; break; } }

  if (tramp2) {
    const result = tramp2.call(xhr2, '{}');
    console.log(`Trampoline result: "${String(result).substring(0, 40)}"`);

    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log(`VM log entries: ${logLen}`);

    if (logLen > 0) {
      const log = JSON.parse(vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied));

      // 找到 args[5] 最后一次非空值 → 变为 "" 的位置
      console.log('\n=== args[5] 变化追踪 ===');
      let lastNonEmpty = null;
      for (let i = 0; i < log.length; i++) {
        const a5 = log[i].a5;
        if (a5 && a5 !== 'undef' && a5 !== '' && a5.length > 2) {
          lastNonEmpty = { idx: i, a5: a5.substring(0, 60) };
        }
        // 检查从非空变为空
        if (lastNonEmpty && (a5 === '' || a5 === 'undef') && i > lastNonEmpty.idx) {
          console.log(`\n*** args[5] 从非空变为空 ***`);
          console.log(`  最后非空: [${lastNonEmpty.idx}] "${lastNonEmpty.a5}"`);
          console.log(`  变为空: [${i}] "${a5}"`);
          console.log(`  之间的条目:`);
          for (let j = lastNonEmpty.idx; j <= Math.min(i, lastNonEmpty.idx + 10); j++) {
            console.log(`    [${j}] a4=${log[j].a4} a5="${(log[j].a5||'').substring(0, 40)}"`);
          }
          break;
        }
      }

      // 显示所有非空 args[5]
      console.log('\n=== 所有非空 args[5] ===');
      for (let i = 0; i < log.length; i++) {
        const a5 = log[i].a5;
        if (a5 && a5 !== 'undef' && a5 !== '' && a5.length > 2) {
          console.log(`  [${i}] a4=${log[i].a4} a5="${a5.substring(0, 60)}"`);
        }
      }

      // 显示最后 20 条
      console.log('\n=== 最后 20 条 ===');
      log.slice(-20).forEach((e, i) => {
        console.log(`  [${log.length - 20 + i}] a4=${e.a4} a5="${(e.a5||'').substring(0, 40)}"`);
      });

      // 保存
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/vm-args5-detailed.json'),
        JSON.stringify({ log, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
      );
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
