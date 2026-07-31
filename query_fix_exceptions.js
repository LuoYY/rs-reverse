/**
 * query_fix_exceptions.js — 逐个修复 4 个异常
 *
 * 异常列表：
 * 0. String.prototype.charAt called on null or undefined
 * 1. Cannot read properties of undefined (reading 'length')
 * 2. Cannot read properties of undefined (reading 'call')
 * 3. _$$1[_$iU[27]] is not a function
 *
 * 方法：
 * 1. 在 catch 块中添加更详细的 logging（包括调用栈）
 * 2. 找到每个异常的具体来源
 * 3. 补全沙箱环境
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = __dirname;
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
const { httpGet } = require('./proxy_http');
const { buildEnv } = require('./output/keygen/sandbox_keygen.js');

(async () => {
  console.log('=== 修复 4 个异常 ===\n');

  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const client = new PmosXjClientProxy();
  await client.init();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;

  // Pass 1: 获取动态代码
  const env1 = buildEnv({ nsd, cd }, { seedCookie });
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

  // Patch: catch 块中添加详细 logging（包括栈）
  var catchPattern = /catch\s*\(([_$$a-zA-Z0-9]+)\)\s*\{/g;
  var patched = dynCode;
  var match;
  var patchCount = 0;
  var offset = 0;
  
  while ((match = catchPattern.exec(dynCode)) !== null) {
    var errVar = match[1];
    var insertPos = match.index + match[0].length + offset;
    // 记录错误消息 + 调用栈前 3 帧
    var insert = 'if(!window.__ce)window.__ce=[];window.__ce.push({msg:(' + errVar + '&&' + errVar + '.message?' + errVar + '.message.substring(0,80):String(' + errVar + ').substring(0,80)),stack:(' + errVar + '&&' + errVar + '.stack?' + errVar + '.stack.split("\\n").slice(1,4).join(" | ").substring(0,200):"no-stack")});';
    patched = patched.substring(0, insertPos) + insert + patched.substring(insertPos);
    offset += insert.length;
    patchCount++;
  }
  console.log('Patched', patchCount, 'catch blocks');

  // 执行 patched
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
  let done = false;
  env2.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !done) { done = true; return origEval2.call(this, patched); }
    return origEval2.call(this, code);
  };
  try { vm.runInContext(fs.readFileSync(OUTER_JS, 'utf8'), env2.proxied, { timeout: 30000 }); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));

  vm.runInContext('window.__ce = []', env2.proxied);

  // 触发 trampoline
  const xhr = new RSXHR2();
  RSXHR2.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'boolean') xhr[k] = true; }
  let tramp = null;
  for (const k in xhr) { if (k.startsWith('_$') && typeof xhr[k] === 'function') { tramp = xhr[k]; break; } }

  if (tramp) {
    const result = tramp.call(xhr, '{}');
    console.log('\nTrampoline result: "' + String(result).substring(0, 40) + '"');

    const catches = vm.runInContext('window.__ce || []', env2.proxied);
    console.log('\n=== Catch logs: ' + catches.length + ' ===');
    catches.forEach((e, i) => {
      console.log('\n[' + i + '] msg: ' + e.msg);
      console.log('    stack: ' + e.stack);
    });

    // 分析每个异常并尝试修复
    console.log('\n=== 异常分析 ===');
    catches.forEach((e, i) => {
      console.log('\n异常 ' + i + ': ' + e.msg);
      if (e.msg.includes('charAt')) {
        console.log('  原因: 某个值是 null/undefined 但被当作字符串调用 charAt');
        console.log('  可能: document.createElement().getAttribute() 返回 null');
        console.log('  修复: 确保 DOM 方法不返回 null');
      } else if (e.msg.includes('length')) {
        console.log('  原因: 某个 undefined 值的 length 属性被访问');
        console.log('  可能: 某个 DOM 属性返回 undefined');
      } else if (e.msg.includes('call')) {
        console.log('  原因: undefined.call() 被调用');
        console.log('  可能: 某个函数引用是 undefined');
      } else if (e.msg.includes('is not a function')) {
        console.log('  原因: 常量池索引对应的属性不是函数');
        console.log('  可能: 某个浏览器 API 在沙箱中不存在');
      }
    });
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/catch-exceptions.json'),
    JSON.stringify({ catches, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
  );

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
