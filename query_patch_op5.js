/**
 * query_patch_op5.js — Patch op5(return false) → 空操作
 *
 * op5 的 handler 是 "return false"
 * 导致 VM 退出码 ≠ 1 → trampoline 不返回 query 值
 * 
 * 修改 op5 为空操作 → VM 继续执行 → 生成 query
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== Patch op5 → 空操作 ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  // Pass 1: 获取动态代码
  const env1 = buildEnv({ nsd, cd }, { seedCookie: oCookie });
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

  // Patch: 将动态代码中的 "return false" 替换为 "0"
  // 但要小心：不是所有 "return false" 都是 op5 的
  // 只替换操作码表区域的 "return false"
  
  // 从 bestBucket 区域搜索 ===5 后面的 return false
  var data = JSON.parse(fs.readFileSync('output/capture-20080/same-session-bytecode.json', 'utf8'));
  var pos = data.bestBucket.pos;
  var region = dynCode.substring(pos, pos + 10000);
  
  // 找到 ===5 后面的 return false
  var eq5Pattern = /===?\s*5\s*\)\s*\{?\s*return\s+false/g;
  var match;
  var patchCount = 0;
  var patchedRegion = region;
  while ((match = eq5Pattern.exec(patchedRegion)) !== null) {
    console.log('Found ===5)return false at offset', match.index);
    patchedRegion = patchedRegion.substring(0, match.index) + 
      match[0].replace('return false', '0') + 
      patchedRegion.substring(match.index + match[0].length);
    patchCount++;
  }
  console.log('Patched', patchCount, 'occurrences');
  
  // 也搜索 ===5{return false 模式
  var eq5Pattern2 = /===?\s*5\s*\)\s*\{?\s*return\s+false/g;
  
  // 如果没找到，尝试更宽松的搜索
  if (patchCount === 0) {
    // 搜索区域中的所有 return false
    var rfCount = (region.match(/return\s+false/g) || []).length;
    console.log('return false in region:', rfCount);
    
    // 搜索 ===5 附近的代码
    var eq5Idx = region.indexOf('===5');
    if (eq5Idx >= 0) {
      console.log('===5 at offset', eq5Idx);
      console.log('Context:', region.substring(eq5Idx, eq5Idx + 100));
    }
    
    // 搜索 ===5) 模式
    var allEq5 = [];
    var eqPattern = /===?\s*5\b/g;
    while ((match = eqPattern.exec(region)) !== null) {
      var ctx = region.substring(match.index, match.index + 60);
      allEq5.push({ pos: match.index, ctx });
    }
    console.log('\n===5 occurrences:', allEq5.length);
    allEq5.slice(0, 5).forEach(function(e) { console.log('  at', e.pos, ':', e.ctx.substring(0, 50)); });
  }
  
  // 构造 patched 动态代码
  var patched = dynCode.substring(0, pos) + patchedRegion + dynCode.substring(pos + region.length);
  
  // Pass 2: 执行 patched 代码
  console.log('\n[Pass 2] 执行 patched 代码...');
  const env2 = buildEnv({ nsd, cd }, { seedCookie: oCookie });
  env2.sandbox.document = new Proxy(env2.sandbox.document, {
    get(t, p) { if (p === 'cookie') return oCookie; return t[p]; },
    set(t, p, v) { if (p === 'cookie' && String(v).includes('aoU85Lxl9xxNP=')) return true; t[p] = v; return true; },
  });
  function RSXHR2() {}
  RSXHR2.prototype = {};
  for (const key in RSXHR.prototype) RSXHR2.prototype[key] = RSXHR.prototype[key];
  env2.sandbox.XMLHttpRequest = RSXHR2;

  const origEval2 = env2.sandbox.eval;
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) { console.log('VM err:', e.message.substring(0, 80)); }
  await new Promise(r => setTimeout(r, 2000));

  // 检查 XHR hook
  const openStr = RSXHR2.prototype.open.toString();
  console.log('XHR.open hooked:', !openStr.includes('_method'));

  // 触发 trampoline
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    const result = tramp.call(xhr, '{}');
    console.log('\nTrampoline result: "' + String(result).substring(0, 80) + '"');
    console.log('Result length:', typeof result === 'string' ? result.length : 0);
    
    if (result && typeof result === 'string' && result.length > 10) {
      console.log('\n*** QUERY CAPTURED! ***');
      console.log('Query:', result.substring(0, 80));
      fs.writeFileSync(
        path.join(ROOT, 'output/capture-20080/query-captured.json'),
        JSON.stringify({ query: result, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
      );
      console.log('Saved!');
    } else if (result === false || result === undefined) {
      console.log('\nResult is false/undefined — op5 patch may not be sufficient');
      console.log('Need to patch more conditions');
    } else {
      console.log('\nResult is empty string — op5 patch did not help');
    }
  } else {
    console.log('No trampoline found');
  }

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
