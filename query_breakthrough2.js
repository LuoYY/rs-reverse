/**
 * query_breakthrough2.js — Patch 动态代码，强制启用 query 生成
 *
 * 核心思路：
 * 1. 管线 cookie 注入沙箱（seedCookie = 有效 O+P）
 * 2. 在 eval hook 中 patch 动态代码：
 *    - trampoline 函数总是以 if(XX.YY) 开头（YY 是"已验证"flag）
 *    - 用正则找到这个模式，将条件强制为 true
 * 3. 执行 patched 动态代码 → RS trampoline 跳过验证 → 生成 query
 *
 * 之前发现：trampoline 源码 = function _$mh(){...if(_$i7._$h9)(...query gen...)}
 *           _$i7._$h9 = false → 跳过 query 生成 → 返回 ""
 *           patch if(_$i7._$h9) → if(true) → 执行 query 生成
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(url, cookie) {
  return new Promise(r => {
    const headers = { 'User-Agent': UA, 'Accept': '*/*' };
    if (cookie) headers['Cookie'] = cookie;
    https.get(url, { rejectUnauthorized: false, headers }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => r({ status: res.statusCode, body: b, headers: res.headers }));
    }).on('error', e => r({ status: 'ERR', body: '', headers: {} }));
  });
}

// ---- 原型模式 XHR ----
function createProtoXHR(queryCapture) {
  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) {
      this._method = method; this._url = String(url); this._headers = {}; this.readyState = 1;
    },
    send: function(body) {
      var self = this;
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) { queryCapture.value = match[1]; queryCapture.url = self._url; queryCapture.method = self._method; }
      }
      Promise.resolve().then(function() {
        if (self._url && self._url.includes('r20SZOQm=')) {
          var m2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (m2 && !queryCapture.value) { queryCapture.value = m2[1]; queryCapture.url = self._url; }
        }
        self.readyState = 4; self.status = 200;
        self.responseText = '{"status":0,"message":"Success"}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; }, getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) { if (type === 'load') this.onload = fn; if (type === 'readystatechange') this.onreadystatechange = fn; },
    removeEventListener: function() {}, upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };
  return RSXHR;
}

// ---- 构建沙箱 + patch 动态代码 ----
function buildPatchedSandbox(ts, opts = {}) {
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env = buildEnv(ts, opts);

  const queryCapture = { value: null, url: null, method: null };
  env.sandbox.XMLHttpRequest = createProtoXHR(queryCapture);

  // Patch eval hook：在动态代码执行前修改
  const origEval = env.sandbox.eval;
  let patchCount = 0;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000) {
      // 这是动态代码，进行 patch
      console.log(`[Patch] 动态代码长度: ${code.length}`);

      // 策略 1: 找到 trampoline 函数中的 if(XX.YY) 模式
      // trampoline 结构: function _$xx(){var ...;if(_$yy._$zz)(...query gen...);return ...}
      // 将 if(_$yy._$zz) 替换为 if(true)

      // 匹配模式: if(_$xx._$yy)(  其中 xx 是 2-3 字符，yy 是 2-3 字符
      const trampolinePattern = /if\(_\$[a-zA-Z0-9]{2,3}\._\$[a-zA-Z0-9]{2,3}\)\(/g;
      const matches = code.match(trampolinePattern);
      console.log(`[Patch] 找到 trampoline 条件: ${matches ? matches.length : 0} 个`);
      if (matches) matches.slice(0, 5).forEach(m => console.log(`  ${m}`));

      if (matches && matches.length > 0) {
        // 替换所有 if(_$xx._$yy)( 为 if(true)(
        let patched = code.replace(trampolinePattern, 'if(true)(');
        patchCount += matches.length;
        console.log(`[Patch] 替换了 ${matches.length} 个条件`);

        // 策略 2: 也替换 if(_$xx._$yy) 后面不带 ( 的情况
        // if(_$xx._$yy){ → if(true){
        patched = patched.replace(/if\(_\$[a-zA-Z0-9]{2,3}\._\$[a-zA-Z0-9]{2,3}\)\{/g, 'if(true){');

        // 策略 3: 替换 =false 赋值（flag 设置）为 =true
        // 但这太激进，可能影响其他逻辑
        // 只替换 trampoline 相关的 false

        code = patched;
      }

      // 策略 4: 找到所有 catch 块中的 =" " 赋值（trampoline 返回空字符串的来源）
      // catch(e){...=""} → catch(e){}  (不吞错误，让异常暴露)
      const catchPattern = /catch\([^)]*\)\{[^}]*=""[^}]*\}/g;
      const catchMatches = code.match(catchPattern);
      if (catchMatches) {
        console.log(`[Patch] 找到 catch+="" 块: ${catchMatches.length} 个`);
      }

      // 保存 patched 代码用于分析
      fs.writeFileSync('/tmp/patched-dyn-code.js', code);
      console.log(`[Patch] patched 代码已保存到 /tmp/patched-dyn-code.js (${code.length} bytes)`);
    }
    return origEval.call(this, code);
  };

  return { ...env, queryCapture, getPatchCount: () => patchCount };
}

// ---- 主流程 ----
(async () => {
  console.log('=== P0-v2: Patch 动态代码，强制启用 query 生成 ===\n');

  // Step 1: 获取管线有效 cookie
  console.log('[Step 1] 获取管线有效 cookie...');
  const { PmosXjClient } = require('./pmos_xj_client');
  const client = new PmosXjClient();
  await client.init();
  const { nsd, cd, oCookie } = await client._fetchChallenge();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);
  const header = `${oCookie}; ${pName}=${pCookie}`;
  const replay = await httpGet(TARGET, header);
  console.log(`  cookie 验证: ${replay.status}`);

  // Step 2: 构建 patched 沙箱
  console.log('\n[Step 2] 构建 patched 沙箱...');
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;
  const env = buildPatchedSandbox({ nsd, cd }, { seedCookie });

  // Step 3: 执行外层 VM
  console.log('\n[Step 3] 执行外层 VM（含 patched 动态代码）...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' });
    console.log('  外层 VM 执行完成');
  } catch (e) {
    console.log('  外层 VM 错误:', e.message.substring(0, 120));
  }

  await new Promise(r => setTimeout(r, 3000));
  console.log(`  Cookies: ${env.captured.cookies.length}`);
  console.log(`  Errors: ${env.captured.errors.length}`);
  if (env.captured.errors.length > 0) {
    console.log('  First errors:');
    env.captured.errors.slice(0, 3).forEach(e => console.log(`    ${e.substring(0, 100)}`));
  }

  // Step 4: 检查 RS hook
  console.log('\n[Step 4] 检查 RS XHR hook...');
  const RSXHR = env.sandbox.XMLHttpRequest;
  const openStr = RSXHR.prototype.open.toString();
  console.log(`  open hooked: ${!openStr.includes('_method')}`);

  // Step 5: 触发 XHR POST
  console.log('\n[Step 5] 触发 XHR POST...');
  try {
    const xhr = new RSXHR();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

    // 检查 RS 设置的属性
    const rsProps = [];
    for (const k in xhr) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        rsProps.push(`${k}=${typeof xhr[k]}:${String(xhr[k]).substring(0, 40)}`);
      }
    }
    console.log(`  RS props: ${rsProps.join(', ')}`);

    // 强制 flag=true
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
        xhr[k] = true;
        console.log(`  Forced ${k}=true`);
      }
    }

    xhr.send('{}');
    console.log(`  After send: _url=${xhr._url}`);

    if (env.queryCapture.value) {
      console.log(`\n  *** [BREAKTHROUGH] Query captured! ***`);
      console.log(`  Query: ${env.queryCapture.value.substring(0, 80)}`);
    } else {
      console.log('\n  [FAIL] Still no query');

      // 尝试直接调用 trampoline
      console.log('\n  --- Direct trampoline call ---');
      for (const k in xhr) {
        if (k.startsWith('_$') && typeof xhr[k] === 'function') {
          console.log(`  Calling ${k}...`);
          try {
            const result = xhr[k].call(xhr, '{}');
            console.log(`  Result: ${typeof result} = "${String(result).substring(0, 80)}"`);
            if (result && typeof result === 'string' && result.length > 10) {
              console.log(`  *** POTENTIAL QUERY: ${result.substring(0, 80)} ***`);
              env.queryCapture.value = result;
            }
          } catch (e) {
            console.log(`  Error: ${e.message.substring(0, 100)}`);
            // 如果有异常，打印堆栈
            if (e.stack) {
              console.log(`  Stack: ${e.stack.split('\n').slice(0, 3).join('\n')}`);
            }
          }
        }
      }
    }
  } catch (e) {
    console.log('  XHR error:', e.message);
  }

  // 等待异步
  await new Promise(r => setTimeout(r, 2000));

  // Step 6: 如果还是空字符串，检查 patched 代码中的条件
  if (!env.queryCapture.value) {
    console.log('\n[Step 6] 分析 patched 代码...');
    const patched = fs.readFileSync('/tmp/patched-dyn-code.js', 'utf8');

    // 搜索 if(true)( 模式（我们 patch 的结果）
    const patchedPatterns = patched.match(/if\(true\)\(/g);
    console.log(`  if(true)( count: ${patchedPatterns ? patchedPatterns.length : 0}`);

    // 搜索原始 if(_$xx._$yy)( 模式（未被 patch 的）
    const remaining = patched.match(/if\(_\$[a-zA-Z0-9]{2,3}\._\$[a-zA-Z0-9]{2,3}\)\(/g);
    console.log(`  Remaining if(_$xx._$yy)( count: ${remaining ? remaining.length : 0}`);

    // 搜索 return "" 模式（trampoline 返回空字符串的来源）
    const returnEmpty = patched.match(/return\s*""/g);
    console.log(`  return "" count: ${returnEmpty ? returnEmpty.length : 0}`);

    // 搜索 return _$xx[5] 模式（trampoline 返回 argsArray[5]）
    const returnArg = patched.match(/return\s*_\$[a-zA-Z0-9]{2,3}\[5\]/g);
    console.log(`  return _$xx[5] count: ${returnArg ? returnArg.length : 0}`);

    // 检查 trampoline 函数的结构
    // 找到所有 function 定义
    const funcDefs = patched.match(/function\s+_\$[a-zA-Z0-9]{2,3}\s*\(/g);
    console.log(`  Function definitions: ${funcDefs ? funcDefs.length : 0}`);

    // 找到 trampoline：function _$xx(){var _$xx,...;if(true)(...);return _$xx[5];}
    // 或 function _$xx(){var _$xx,...;if(true)(...);return ""}
    const trampPattern = /function\s+(_\$[a-zA-Z0-9]{2,3})\s*\(\)\s*\{var\s+\1[^}]*if\(true\)\([^)]*\)[^}]*\}/g;
    const tramps = patched.match(trampPattern);
    console.log(`  Trampoline functions: ${tramps ? tramps.length : 0}`);

    // 尝试更宽松的搜索
    const ifTrueCount = (patched.match(/if\(true\)/g) || []).length;
    console.log(`  Total if(true): ${ifTrueCount}`);

    // 检查是否有 exitCode 检查
    const exitCodePattern = patched.match(/exitCode|exit_code|_\$[a-zA-Z0-9]{2,3}===1|_\$[a-zA-Z0-9]{2,3}===2/g);
    console.log(`  Exit code patterns: ${exitCodePattern ? exitCodePattern.length : 0}`);
    if (exitCodePattern) exitCodePattern.slice(0, 3).forEach(p => console.log(`    ${p}`));
  }

  // 最终结果
  if (env.queryCapture.value) {
    console.log('\n=== 成功！Query 已捕获 ===');
    console.log(`Query: ${env.queryCapture.value}`);

    // 解码分析
    const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
    const idxmap = {};
    basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const payload = env.queryCapture.value.startsWith('0') ? env.queryCapture.value.slice(1) : env.queryCapture.value;
    const bytes = [];
    let i = 0;
    const full = Math.floor(payload.length / 4);
    for (let g = 0; g < full; g++) {
      const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
      i += 4; bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
    }
    const rem = payload.length - i;
    if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
    else if (rem === 3) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4), ((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));

    console.log(`Decoded: ${bytes.length} bytes`);
    console.log(`Bytes: [${bytes.join(',')}]`);

    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/query-breakthrough-result.json'),
      JSON.stringify({ query: env.queryCapture.value, bytes, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
    );
    console.log('结果已保存');
  } else {
    console.log('\n=== 未捕获到 query ===');
    console.log('Patch 策略可能不够，需要更深入分析 trampoline VM');
  }

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
