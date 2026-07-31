/**
 * query_breakthrough.js — P0 方案：管线 cookie 注入沙箱，启用 RS query 生成
 *
 * 核心思路：
 * 1. 管线 pmos_xj_client 生成 100% 有效的 O+P cookie（含 numarr2string 修复）
 * 2. 用同一个 nsd/cd 构建沙箱（buildEnv），seedCookie = 有效 O+P cookie
 * 3. 沙箱 XHR 改为原型模式（让 RS 能 hook prototype.open/send）
 * 4. 执行外层 VM → RS 检测有效 cookie → 启用 query 生成（flag=true）
 * 5. 触发 XHR POST → RS trampoline 生成 query → 捕获
 * 6. 分析 query 加密过程
 *
 * 之前失败原因：sandbox_keygen.js 的 cookie 生成不经管线 numarr2string 修复
 * → cookie 被 400 拒绝 → RS $_mb["verified"] 未设置 → flag=false
 *
 * 本脚本用管线 100% cookie 绕过此限制
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

// ---- 管线 cookie 生成（复用 pmos_xj_client 逻辑）----
async function getValidCookie() {
  const { PmosXjClient } = require('./pmos_xj_client');
  const client = new PmosXjClient();
  await client.init();

  // 提取 nsd/cd（用于沙箱）
  const { nsd, cd, oCookie } = await client._fetchChallenge();
  const cp3 = client._extractCp3(nsd, cd);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  const { cookie: pCookie, name: pName } = await client._genCookie(ts, cp3);

  // 验证 cookie 有效
  const header = `${oCookie}; ${pName}=${pCookie}`;
  const replay = await httpGet(TARGET, header);
  console.log(`[Pipeline] cookie 验证: ${replay.status} (期望 200)`);

  if (replay.status !== 200) {
    throw new Error(`管线 cookie 无效: ${replay.status}`);
  }

  return { nsd, cd, oCookie, pCookie, pName, cookieHeader: header };
}

// ---- 原型模式 XHR（让 RS 能 hook prototype.open/send）----
function createProtoXHR(queryCapture) {
  function RSXHR() {}
  RSXHR.prototype = {
    readyState: 0, status: 0, responseText: '', responseURL: '',
    UNSENT: 0, OPENED: 1, HEADERS_RECEIVED: 2, LOADING: 3, DONE: 4,
    timeout: 0, withCredentials: false,
    open: function(method, url) {
      this._method = method;
      this._url = String(url);
      this._headers = {};
      this.readyState = 1;
    },
    send: function(body) {
      var self = this;
      // 检查 RS 是否修改了 URL（追加了 query）
      if (self._url && self._url.includes('r20SZOQm=')) {
        var match = self._url.match(/r20SZOQm=([^&]+)/);
        if (match) {
          queryCapture.value = match[1];
          queryCapture.url = self._url;
          queryCapture.method = self._method;
          console.log('[CAPTURE] query=' + match[1].substring(0, 50) + '...');
        }
      }
      // 异步模拟响应
      Promise.resolve().then(function() {
        if (self._url && self._url.includes('r20SZOQm=')) {
          var match2 = self._url.match(/r20SZOQm=([^&]+)/);
          if (match2 && !queryCapture.value) {
            queryCapture.value = match2[1];
            queryCapture.url = self._url;
            console.log('[CAPTURE-ASYNC] query=' + match2[1].substring(0, 50) + '...');
          }
        }
        self.readyState = 2;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        self.readyState = 4;
        self.status = 200;
        self.responseText = '{"status":0,"message":"Success","data":{}}';
        self.responseURL = self._url;
        if (self.onreadystatechange) { try { self.onreadystatechange(); } catch(e) {} }
        if (self.onload) { try { self.onload(); } catch(e) {} }
      });
    },
    setRequestHeader: function(k, v) { if (!this._headers) this._headers = {}; this._headers[k] = v; },
    abort: function() {}, overrideMimeType: function() {},
    getAllResponseHeaders: function() { return ''; },
    getResponseHeader: function() { return null; },
    addEventListener: function(type, fn) {
      if (type === 'load') this.onload = fn;
      if (type === 'readystatechange') this.onreadystatechange = fn;
    },
    removeEventListener: function() {},
    upload: { addEventListener: function() {}, removeEventListener: function() {} },
  };
  return RSXHR;
}

// ---- 构建沙箱（基于 buildEnv，但替换 XHR 为原型模式）----
function buildQuerySandbox(ts, opts = {}) {
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env = buildEnv(ts, opts);

  // 替换 XHR 为原型模式
  const queryCapture = { value: null, url: null, method: null };
  env.sandbox.XMLHttpRequest = createProtoXHR(queryCapture);

  return { ...env, queryCapture };
}

// ---- 主流程 ----
(async () => {
  console.log('=== P0: 管线 cookie 注入沙箱，启用 RS query 生成 ===\n');

  // Step 1: 获取管线 100% 有效 cookie
  console.log('[Step 1] 获取管线有效 cookie...');
  const { nsd, cd, oCookie, pCookie, pName, cookieHeader } = await getValidCookie();
  console.log(`  nsd=${nsd}, cd_len=${cd.length}`);
  console.log(`  O cookie: ${oCookie.substring(0, 30)}...`);
  console.log(`  P cookie: ${pName}=${pCookie.substring(0, 30)}... (${pCookie.length} chars)`);

  // Step 2: 构建沙箱（seedCookie = 有效 O+P cookie）
  console.log('\n[Step 2] 构建沙箱（seedCookie = 管线有效 cookie）...');
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;
  const ts = { nsd, cd };
  const env = buildQuerySandbox(ts, { seedCookie });
  console.log('  沙箱构建完成');

  // Step 3: 执行外层 VM
  console.log('\n[Step 3] 执行外层 VM...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' });
    console.log('  外层 VM 执行完成');
  } catch (e) {
    console.log('  外层 VM 错误:', e.message.substring(0, 100));
  }

  // 等待异步操作
  await new Promise(r => setTimeout(r, 3000));

  console.log(`\n  Cookies captured: ${env.captured.cookies.length}`);
  env.captured.cookies.forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 80)}`));

  // Step 4: 检查 RS 是否 hook 了 XHR
  console.log('\n[Step 4] 检查 RS XHR hook...');
  const RSXHR = env.sandbox.XMLHttpRequest;
  const openStr = RSXHR.prototype.open.toString();
  const sendStr = RSXHR.prototype.send.toString();
  const isHooked = !openStr.includes('_method');
  console.log(`  prototype.open hooked: ${isHooked}`);
  console.log(`  open: ${openStr.substring(0, 80)}`);
  console.log(`  send: ${sendStr.substring(0, 80)}`);

  if (!isHooked) {
    console.log('\n  [WARN] RS 未 hook XHR prototype，可能动态代码未正确执行');
    console.log('  Errors:', env.captured.errors.length);
    env.captured.errors.slice(0, 5).forEach(e => console.log(`    ${e.substring(0, 100)}`));
  }

  // Step 5: 触发 XHR POST
  console.log('\n[Step 5] 触发 XHR POST...');
  try {
    const xhr = new RSXHR();
    xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    console.log(`  After open: _url=${xhr._url}`);

    // 检查 RS 设置的实例属性
    const rsProps = [];
    for (const k in xhr) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        rsProps.push(`${k}=${typeof xhr[k]}:${String(xhr[k]).substring(0, 30)}`);
      }
    }
    if (rsProps.length > 0) console.log('  RS props:', rsProps.join(', '));

    xhr.send('{}');
    console.log(`  After send: _url=${xhr._url}`);

    // 检查 query
    if (env.queryCapture.value) {
      console.log(`\n  [SUCCESS] Query captured: ${env.queryCapture.value.substring(0, 60)}...`);
    } else {
      console.log('  [FAIL] No query captured');

      // Step 6: 如果 flag 仍为 false，尝试强制 flag=true
      console.log('\n[Step 6] 尝试强制 flag=true...');
      const boolFlags = [];
      for (const k in xhr) {
        if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
          boolFlags.push(k);
        }
      }
      console.log(`  Boolean flags: ${boolFlags.join(', ')}`);

      if (boolFlags.length > 0) {
        const xhr2 = new RSXHR();
        RSXHR.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
        boolFlags.forEach(f => { xhr2[f] = true; });
        console.log(`  Forced flags: ${boolFlags.map(f => `${f}=true`).join(', ')}`);

        // 找到 trampoline 函数
        let trampoline = null;
        let trampName = null;
        for (const k in xhr2) {
          if (k.startsWith('_$') && typeof xhr2[k] === 'function') {
            trampoline = xhr2[k];
            trampName = k;
          }
        }
        if (trampoline) {
          console.log(`  Trampoline: ${trampName}`);
          console.log(`  Source: ${trampoline.toString().substring(0, 100)}`);

          // 调用 trampoline
          try {
            const result = trampoline.call(xhr2, '{}');
            console.log(`  Trampoline result: ${typeof result} = ${String(result).substring(0, 80)}`);

            if (result && typeof result === 'string' && result.length > 10) {
              console.log(`\n  [BREAKTHROUGH] Trampoline returned query value!`);
              console.log(`  Query: ${result.substring(0, 80)}`);
              env.queryCapture.value = result;
            } else if (result === '') {
              console.log('  Trampoline returned empty string (VM skipped query gen)');
              console.log('  → RS internal state still not "verified"');
              console.log('  → Need to investigate $_mb state array');
            }
          } catch (e) {
            console.log(`  Trampoline error: ${e.message.substring(0, 100)}`);
          }
        }

        // 也尝试调用 RS send
        try {
          RSXHR.prototype.send.call(xhr2, '{}');
          console.log(`  After forced send: _url=${xhr2._url}`);
          if (xhr2._url && xhr2._url.includes('r20SZOQm=')) {
            const match = xhr2._url.match(/r20SZOQm=([^&]+)/);
            if (match) {
              console.log(`\n  [BREAKTHROUGH] Query in URL!`);
              console.log(`  Query: ${match[1].substring(0, 80)}`);
              env.queryCapture.value = match[1];
            }
          }
        } catch (e) {
          console.log(`  Forced send error: ${e.message.substring(0, 100)}`);
        }
      }
    }
  } catch (e) {
    console.log('  XHR error:', e.message);
  }

  // 等待异步
  await new Promise(r => setTimeout(r, 2000));

  // Step 7: 如果成功捕获 query，分析其结构
  if (env.queryCapture.value) {
    console.log('\n=== Query 分析 ===');
    const queryVal = env.queryCapture.value;
    console.log(`Full query: ${queryVal}`);
    console.log(`Length: ${queryVal.length} chars`);

    // 解码 query
    const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
    const idxmap = {};
    basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

    const payload = queryVal.startsWith('0') ? queryVal.slice(1) : queryVal;
    const bytes = [];
    let i = 0;
    const full = Math.floor(payload.length / 4);
    for (let g = 0; g < full; g++) {
      const c0 = idxmap[payload[i]], c1 = idxmap[payload[i + 1]], c2 = idxmap[payload[i + 2]], c3 = idxmap[payload[i + 3]];
      i += 4;
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    const rem = payload.length - i;
    if (rem === 2) bytes.push((idxmap[payload[i]] << 2) | (idxmap[payload[i + 1]] >> 4));
    else if (rem === 3) bytes.push((idxmap[payload[i]] << 2) | (idxmap[payload[i + 1]] >> 4), ((idxmap[payload[i + 1]] & 15) << 4) | (idxmap[payload[i + 2]] >> 2));

    console.log(`Decoded bytes: ${bytes.length}`);
    console.log(`Bytes: [${bytes.join(',')}]`);

    // 检查 numarrJoin 结构
    if (bytes.length >= 7) {
      console.log(`\nnumarrJoin structure:`);
      console.log(`  nonce: [${bytes.slice(0, 4).join(',')}]`);
      console.log(`  header: [${bytes[4]}, ${bytes[5]}]`);
      if (bytes[6] === 48 && bytes.length >= 55) {
        console.log(`  session_data (48B): [${bytes.slice(7, 55).join(',')}]`);
        if (bytes[55] === 32 && bytes.length >= 88) {
          console.log(`  request_data (32B): [${bytes.slice(56, 88).join(',')}]`);
        }
      }
    }

    // 保存结果
    const result = {
      query: queryVal,
      bytes: bytes,
      method: env.queryCapture.method,
      url: env.queryCapture.url,
      cookieUsed: cookieHeader.substring(0, 50) + '...',
      nsd: nsd,
      cd: cd,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(ROOT, 'output/capture-20080/query-breakthrough-result.json'),
      JSON.stringify(result, null, 2)
    );
    console.log('\n结果已保存到 output/capture-20080/query-breakthrough-result.json');
  } else {
    console.log('\n=== 未捕获到 query ===');
    console.log('RS 仍然未启用 query 生成');
    console.log('可能原因：');
    console.log('1. 管线 cookie 虽然有效（200），但沙箱中 RS 无法验证（无真实 HTTP）');
    console.log('2. RS 需要特定的 $_mb 状态，该状态由服务器 200 响应触发');
    console.log('3. 需要进一步分析 $_mb 状态数组的结构');

    // 尝试在 vm context 中检查 $_mb
    console.log('\n--- 检查 RS 内部状态 ---');
    try {
      const hasMb = vm.runInContext('typeof $_mb', env.proxied);
      console.log(`$_mb type: ${hasMb}`);
      if (hasMb !== 'undefined') {
        const mbStr = vm.runInContext('JSON.stringify($_mb)', env.proxied);
        console.log(`$_mb: ${mbStr?.substring(0, 200)}`);
      }
    } catch (e) {
      console.log(`$_mb check error: ${e.message}`);
    }

    // 检查 $_ts 状态
    try {
      const tsKeys = vm.runInContext('Object.keys($_ts || {})', env.proxied);
      console.log(`$_ts keys: ${JSON.stringify(tsKeys)}`);
    } catch (e) {}
  }

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
