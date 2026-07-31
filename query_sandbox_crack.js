/**
 * query_sandbox_crack.js — 用 sandbox_keygen 方法论破解 query 算法
 *
 * 方法论回顾（cookie 突破）：
 * 1. 不运行动态代码，用管线 Coder 还原算法
 * 2. cd 解密 → keys → basearr → huffman → xor → AES → encode = cookie
 * 3. 每一步都是纯算法，不依赖浏览器环境
 *
 * Query 应该用同样的方法论：
 * 1. 从动态代码中提取 query 生成函数的 bytecode
 * 2. 用 Node vm 在沙箱中执行这个函数
 * 3. 用管线 keys（cd 解密得到的）+ VM trace 的密钥
 * 4. 重现 query 加密过程
 *
 * 关键洞察（来自 args5 trace）：
 * - Entry [88] = keys16（站点固定）
 * - Entry [82] = keys17（nsd/cd 相关）
 * - Entry [109] = 新 key（nsd/cd 相关，可能是 query key）
 * - Entry [73] = basearr（69 字节）
 * - Entry [128] = cookie 值
 *
 * Query 结构（88 字节）：
 * [nonce 4B][1][0][48][session 48B][32][request 32B]
 * session_data 和 request_data 都是 16 的倍数（AES blocks）
 *
 * 策略：
 * 1. 在沙箱中运行 RS 动态代码（buildEnv）
 * 2. 用 prototype XHR 让 RS hook
 * 3. 强制 flag=true
 * 4. 捕获 trampoline 的 args[5]（query 值）
 * 5. 如果 trampoline 返回 ""，分析 bytecode 找跳过条件
 * 6. 修改 bytecode 或 ctx 使条件为 true
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');

(async () => {
  console.log('=== sandbox_keygen 方法论破解 query ===\n');

  // Step 1: 获取挑战页 + 管线 cookie
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
  console.log(`nsd=${nsd}, cookie=${pName}(${pCookie.length})`);

  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

  // ---- Pass 1: 执行动态代码，获取 trampoline + 动态代码 ----
  console.log('\n[Pass 1] 执行动态代码...');
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
  env1.sandbox.document = new Proxy(env1.sandbox.document, {
    get(t, p) { if (p === 'cookie') return seedCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });

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
  const origEval1 = env1.sandbox.eval;
  env1.sandbox.eval = function(code) { if (typeof code === 'string' && code.length > 50000) dynCode = code; return origEval1.call(this, code); };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env1.proxied, { timeout: 30000 }); } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));

  // 获取 trampoline
  const xhr1 = new RSXHR();
  RSXHR.prototype.open.call(xhr1, 'POST', '/test', true);
  let trampSrc = null;
  for (const k in xhr1) { if (k.startsWith('_$') && typeof xhr1[k] === 'function') { trampSrc = xhr1[k].toString(); break; } }
  if (!trampSrc) { console.log('No trampoline'); process.exit(1); }

  // 提取变量名
  const idx0 = trampSrc.indexOf(',0,');
  let p = idx0; while (p > 0 && trampSrc[p] !== '(') p--;
  let fnStart = p - 1; while (fnStart >= 0 && /[_$a-zA-Z0-9]/.test(trampSrc[fnStart])) fnStart--;
  const dispName = trampSrc.substring(fnStart + 1, p);
  const ctxVar = trampSrc.substring(p + 1, idx0);
  const bcProp = trampSrc.substring(idx0).match(/\.([^( ]+)\.length/)[1];
  const argsVar = trampSrc.substring(idx0).match(/length,([^( )]+)\)/)[1];

  console.log(`Dispatcher: ${dispName}, Ctx: ${ctxVar}, Prop: .${bcProp}, Args: ${argsVar}`);

  // ---- Pass 2: patch 动态代码，捕获 VM trace + args[5] ----
  console.log('\n[Pass 2] Patch 动态代码...');
  const callPattern = `${dispName}(${ctxVar},0,${ctxVar}.${bcProp}.length,${argsVar})`;
  const callPos = dynCode.indexOf(callPattern);
  const afterLog = `,(window.__vmLog=window.__vmLog||[]).push({a5:typeof ${argsVar}[5]==='undefined'?'undef':typeof ${argsVar}[5]==='string'?${argsVar}[5].substring(0,200):String(${argsVar}[5]).substring(0,200),a4:typeof ${argsVar}[4]==='undefined'?'undef':String(${argsVar}[4])})`;
  let patched = dynCode.substring(0, callPos) + callPattern + afterLog + dynCode.substring(callPos + callPattern.length);

  // ctx dump
  const ctxSearch = `,0,${ctxVar}.`;
  const ctxPos = patched.indexOf(ctxSearch, callPos);
  if (ctxPos >= 0) {
    let pp = ctxPos; while (pp > 0 && patched[pp] !== '(') pp--;
    const cs = pp + 1, ce = cs + ctxVar.length;
    if (patched.substring(cs, ce) === ctxVar) {
      patched = patched.substring(0, cs) + `(window.__vmCtx=${ctxVar})` + patched.substring(ce);
    }
  }

  // ---- Pass 3: 执行 patched 代码，分析 query 生成 ----
  console.log('\n[Pass 3] 执行 patched 代码...');
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
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch (e) { console.log('VM err:', e.message.substring(0, 80)); }
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
    console.log(`Trampoline result: "${String(result).substring(0, 80)}"`);

    const logLen = vm.runInContext('window.__vmLog ? window.__vmLog.length : 0', env2.proxied);
    console.log(`VM log entries: ${logLen}`);

    if (logLen > 0) {
      const log = JSON.parse(vm.runInContext('JSON.stringify(window.__vmLog)', env2.proxied));

      // 找到 args[5] 中包含逗号分隔数字的条目（字节数组）
      console.log('\n=== 字节数组捕获 ===');
      let keyArrays = [];
      for (let i = 0; i < log.length; i++) {
        const a5 = log[i].a5;
        if (!a5 || a5 === 'undef' || a5.indexOf(',') < 0) continue;
        const parts = a5.split(',');
        const bytes = [];
        let valid = true;
        for (const part of parts) {
          const n = parseInt(part.trim());
          if (isNaN(n) || n < 0 || n > 255) { valid = false; break; }
          bytes.push(n);
        }
        if (valid && bytes.length >= 8) {
          keyArrays.push({ idx: i, data: bytes, len: bytes.length, a5 });
        }
      }

      console.log(`Found ${keyArrays.length} byte arrays:`);
      keyArrays.forEach(a => console.log(`  [${a.idx}] len=${a.len} data=[${a.data.join(',')}]`));

      // 关键：找到 query key（不在 cd keys 中的 16 字节数组）
      // cd keys: keys16=[21,144,168,179,...], keys17=[47,170,146,137,...]
      const cdKeys16 = [21,144,168,179,84,253,195,75,183,231,80,149,100,10,25,180];
      const newKeys = keyArrays.filter(a =>
        a.len >= 16 &&
        JSON.stringify(a.data.slice(0, 16)) !== JSON.stringify(cdKeys16)
      );

      console.log(`\nNew keys (not cd keys): ${newKeys.length}`);
      newKeys.forEach(a => console.log(`  [${a.idx}] data=[${a.data.join(',')}]`));

      // 保存所有捕获的 key
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/vm-trace-keys.json'),
        JSON.stringify({
          nsd, cd,
          keyArrays: keyArrays.map(a => ({ idx: a.idx, data: a.data })),
          newKeys: newKeys.map(a => ({ idx: a.idx, data: a.data })),
          timestamp: new Date().toISOString(),
        }, null, 2)
      );
      console.log('\nKeys saved to vm-trace-keys.json');

      // 检查 VM 上下文
      const hasCtx = vm.runInContext('typeof window.__vmCtx', env2.proxied);
      if (hasCtx !== 'undefined') {
        const ctxKeys = vm.runInContext('Object.keys(window.__vmCtx)', env2.proxied);
        console.log(`\nVM ctx keys: ${ctxKeys}`);
        for (const k of ctxKeys) {
          const v = vm.runInContext(`window.__vmCtx['${k}']`, env2.proxied);
          if (Array.isArray(v)) {
            console.log(`  ${k}: arr[${v.length}] = [${v.slice(0, 10).join(',')}...]`);
          } else {
            console.log(`  ${k}: ${typeof v} = ${v}`);
          }
        }
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
