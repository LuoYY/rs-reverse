/**
 * query_breakthrough3.js — 阻止 RS 覆盖有效 cookie，强制启用 query
 *
 * 核心发现：
 * - RS 检测到 seedCookie 后重新生成新 cookie（有 numarr2string bug）
 * - 新 cookie 覆盖了我们的有效 cookie → RS 内部状态从未"已验证"
 *
 * 解决方案：
 * - document.cookie setter 拦截 P cookie 写入（只允许 O 和 enable_ 写入）
 * - RS 检测到 P cookie 已存在 → 不重新生成 → 走"已验证"路径
 * - 启用 query 生成
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
    open: function(method, url) { this._method = method; this._url = String(url); this._headers = {}; this.readyState = 1; },
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

// ---- 构建沙箱（锁定 P cookie，阻止 RS 覆盖）----
function buildLockedCookieSandbox(ts, opts = {}) {
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env = buildEnv(ts, opts);

  const queryCapture = { value: null, url: null, method: null };
  env.sandbox.XMLHttpRequest = createProtoXHR(queryCapture);

  // 关键：锁定 P cookie，阻止 RS 覆盖
  // document.cookie setter 拦截 P cookie 写入
  const origDoc = env.sandbox.document;
  const lockedCookie = opts.seedCookie || '';
  const capturedCookies = [];
  let pCookieLocked = false;

  // 检测 seedCookie 中的 P cookie 名
  const pMatch = lockedCookie.match(/(aoU85Lxl9xxNP)=[^;]+/);
  const pName = pMatch ? pMatch[1] : null;
  console.log(`[LockCookie] P cookie name: ${pName}`);
  console.log(`[LockCookie] seedCookie: ${lockedCookie.substring(0, 80)}...`);

  // 用 Proxy 包装 document，拦截 cookie setter
  const lockedDoc = new Proxy(origDoc, {
    get(target, prop, receiver) {
      if (prop === 'cookie') {
        // 返回锁定的 cookie（包含有效 P cookie）
        return lockedCookie;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value) {
      if (prop === 'cookie') {
        const val = String(value);
        capturedCookies.push(val);
        console.log(`[LockCookie] cookie set attempt: ${val.substring(0, 60)}...`);

        // 检查是否是 P cookie 写入
        if (pName && val.includes(pName + '=')) {
          console.log(`[LockCookie] *** BLOCKED P cookie overwrite! ***`);
          pCookieLocked = true;
          // 不写入，保持原有 P cookie
          return true;
        }

        // 允许其他 cookie 写入（enable_ 等）
        // 但不影响 getter（getter 总是返回 lockedCookie）
        return true;
      }
      return Reflect.set(target, prop, value);
    },
  });

  env.sandbox.document = lockedDoc;

  return { ...env, queryCapture, getCapturedCookies: () => capturedCookies, wasPCookieLocked: () => pCookieLocked };
}

// ---- 主流程 ----
(async () => {
  console.log('=== P0-v3: 锁定 P cookie，阻止 RS 覆盖 ===\n');

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
  console.log(`  cookie 验证: ${replay.status} (nsd=${nsd})`);

  // Step 2: 构建锁定 cookie 沙箱
  console.log('\n[Step 2] 构建锁定 cookie 沙箱...');
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;
  const env = buildLockedCookieSandbox({ nsd, cd }, { seedCookie });

  // Step 3: 执行外层 VM
  console.log('\n[Step 3] 执行外层 VM...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  try {
    vm.runInContext(outerJsCode, env.proxied, { timeout: 30000, filename: 'outer.js' });
    console.log('  外层 VM 执行完成');
  } catch (e) {
    console.log('  外层 VM 错误:', e.message.substring(0, 120));
  }

  await new Promise(r => setTimeout(r, 3000));

  console.log(`  P cookie was locked: ${env.wasPCookieLocked()}`);
  console.log(`  Cookie set attempts: ${env.getCapturedCookies().length}`);
  env.getCapturedCookies().forEach((c, i) => console.log(`    [${i}] ${c.substring(0, 80)}`));

  // 检查 document.cookie 是否仍包含有效 P cookie
  const currentCookie = vm.runInContext('document.cookie', env.proxied);
  console.log(`  document.cookie: ${currentCookie.substring(0, 80)}...`);
  console.log(`  Contains valid P: ${currentCookie.includes(pCookie.substring(0, 20))}`);

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

    // 检查 flag 值
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
        console.log(`  Flag ${k} = ${xhr[k]}`);
      }
    }

    xhr.send('{}');
    console.log(`  After send: _url=${xhr._url}`);

    if (env.queryCapture.value) {
      console.log(`\n  *** [BREAKTHROUGH] Query captured! ***`);
      console.log(`  Query: ${env.queryCapture.value.substring(0, 80)}`);
    } else {
      console.log('\n  [FAIL] No query captured');

      // 强制 flag=true 并调用 trampoline
      console.log('\n  --- Force flag + trampoline ---');
      const xhr2 = new RSXHR();
      RSXHR.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') {
          xhr2[k] = true;
          console.log(`  Forced ${k}=true`);
        }
      }

      // 找到 trampoline 并调用
      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'function') {
          console.log(`\n  Calling trampoline ${k}...`);
          try {
            const result = xhr2[k].call(xhr2, '{}');
            console.log(`  Result: ${typeof result} = "${String(result).substring(0, 80)}"`);

            if (result && typeof result === 'string' && result.length > 10) {
              console.log(`  *** [BREAKTHROUGH] Query from trampoline! ***`);
              console.log(`  Query: ${result.substring(0, 80)}`);
              env.queryCapture.value = result;
            } else if (result === '') {
              console.log('  Trampoline returned "" (VM still skipping query gen)');
              console.log('  → Cookie lock did not help, RS checks other state');
            }
          } catch (e) {
            console.log(`  Error: ${e.message.substring(0, 120)}`);
            if (e.stack) console.log(`  Stack: ${e.stack.split('\n').slice(0, 3).join('\n')}`);
          }
        }
      }

      // 也尝试 RS send
      if (!env.queryCapture.value) {
        console.log('\n  --- Force flag + RS send ---');
        try {
          RSXHR.prototype.send.call(xhr2, '{}');
          console.log(`  After forced send: _url=${xhr2._url}`);
          if (xhr2._url && xhr2._url.includes('r20SZOQm=')) {
            const match = xhr2._url.match(/r20SZOQm=([^&]+)/);
            if (match) {
              console.log(`  *** [BREAKTHROUGH] Query in URL! ***`);
              env.queryCapture.value = match[1];
            }
          }
        } catch (e) {
          console.log(`  Send error: ${e.message.substring(0, 100)}`);
        }
      }
    }
  } catch (e) {
    console.log('  XHR error:', e.message);
  }

  await new Promise(r => setTimeout(r, 2000));

  // 最终结果
  if (env.queryCapture.value) {
    console.log('\n=== 成功！Query 已捕获 ===');
    console.log(`Query: ${env.queryCapture.value}`);

    // 解码
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
    console.log('Cookie 锁定策略未生效，RS 可能通过其他方式检测 cookie 有效性');
    console.log('下一步：用 CDP 在浏览器中直接断点提取');
  }

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
