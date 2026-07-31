/**
 * query_breakthrough4.js — 删除 $_ts.nsd 模拟 200 页面，启用 query
 *
 * 核心推理：
 * - 浏览器 412 页面：HTML 内联 $_ts.nsd/cd → RS 模式=412（生成 cookie）
 * - 浏览器 200 页面：无 $_ts.nsd/cd → RS 模式=200（启用 query）
 * - 沙箱中始终设置 $_ts.nsd → RS 认为始终在 412 页面 → 不启用 query
 *
 * 解决方案：
 * - eval hook 中，在执行动态代码前删除 $_ts.nsd/cd
 * - 动态代码检测到 $_ts.nsd 不存在 → 模式=200 → 启用 query
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

function buildNoNsdSandbox(ts, opts = {}) {
  const { buildEnv } = require('./output/keygen/sandbox_keygen.js');
  const env = buildEnv(ts, opts);

  const queryCapture = { value: null, url: null, method: null };
  env.sandbox.XMLHttpRequest = createProtoXHR(queryCapture);

  // 锁定 P cookie
  const lockedCookie = opts.seedCookie || '';
  const pMatch = lockedCookie.match(/(aoU85Lxl9xxNP)=[^;]+/);
  const pName = pMatch ? pMatch[1] : null;
  const origDoc = env.sandbox.document;
  const lockedDoc = new Proxy(origDoc, {
    get(target, prop) {
      if (prop === 'cookie') return lockedCookie;
      return target[prop];
    },
    set(target, prop, value) {
      if (prop === 'cookie' && pName && String(value).includes(pName + '=')) return true;
      target[prop] = value; return true;
    },
  });
  env.sandbox.document = lockedDoc;

  // 关键：在 eval hook 中删除 $_ts.nsd/cd
  const origEval = env.sandbox.eval;
  let dynCodeExecuted = false;
  env.sandbox.eval = function(code) {
    if (typeof code === 'string' && code.length > 50000 && !dynCodeExecuted) {
      dynCodeExecuted = true;
      console.log('[NoNsd] 动态代码捕获，删除 $_ts.nsd/cd...');
      console.log(`  Before: $_ts keys = ${vm.runInContext('Object.keys($_ts)', env.proxied)}`);

      // 删除 nsd/cd，模拟 200 页面
      vm.runInContext('delete $_ts.nsd; delete $_ts.cd;', env.proxied);

      console.log(`  After: $_ts keys = ${vm.runInContext('Object.keys($_ts)', env.proxied)}`);
      console.log(`  $_ts.nsd = ${vm.runInContext('typeof $_ts.nsd', env.proxied)}`);
    }
    return origEval.call(this, code);
  };

  return { ...env, queryCapture };
}

(async () => {
  console.log('=== P0-v4: 删除 $_ts.nsd 模拟 200 页面 ===\n');

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

  // Step 2: 构建 NoNsd 沙箱
  console.log('\n[Step 2] 构建 NoNsd 沙箱...');
  const seedCookie = `${oCookie}; ${pName}=${pCookie}`;
  const env = buildNoNsdSandbox({ nsd, cd }, { seedCookie });

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
  console.log(`  Cookies: ${env.captured.cookies.length}`);
  console.log(`  Errors: ${env.captured.errors.length}`);

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

    const rsProps = [];
    for (const k in xhr) {
      if (k.startsWith('_$') || k.startsWith('_$$')) {
        rsProps.push(`${k}=${typeof xhr[k]}:${String(xhr[k]).substring(0, 40)}`);
      }
    }
    console.log(`  RS props: ${rsProps.join(', ')}`);

    // 检查 flag
    let flagName = null;
    for (const k in xhr) {
      if (k.startsWith('_$') && typeof xhr[k] === 'boolean') {
        flagName = k;
        console.log(`  Flag ${k} = ${xhr[k]}`);
      }
    }

    xhr.send('{}');
    console.log(`  After send: _url=${xhr._url}`);

    if (env.queryCapture.value) {
      console.log(`\n  *** [BREAKTHROUGH] Query captured! ***`);
      console.log(`  Query: ${env.queryCapture.value.substring(0, 80)}`);
    } else {
      console.log('\n  [FAIL] No query');

      // 检查 flag 是否为 true（删除 nsd 后 RS 可能直接设为 true）
      if (flagName) {
        console.log(`  Flag ${flagName} after send: ${xhr[flagName]}`);
      }

      // 强制 flag=true + trampoline
      console.log('\n  --- Force flag + trampoline ---');
      const xhr2 = new RSXHR();
      RSXHR.prototype.open.call(xhr2, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);

      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'boolean') {
          xhr2[k] = true;
          console.log(`  Forced ${k}=true`);
        }
      }

      for (const k in xhr2) {
        if (k.startsWith('_$') && typeof xhr2[k] === 'function') {
          console.log(`\n  Calling trampoline ${k}...`);
          try {
            const result = xhr2[k].call(xhr2, '{}');
            console.log(`  Result: ${typeof result} = "${String(result).substring(0, 80)}"`);
            if (result && typeof result === 'string' && result.length > 10) {
              console.log(`  *** [BREAKTHROUGH] Query from trampoline! ***`);
              env.queryCapture.value = result;
            } else if (result === '') {
              console.log('  Still empty string');
            }
          } catch (e) {
            console.log(`  Error: ${e.message.substring(0, 120)}`);
          }
        }
      }
    }
  } catch (e) {
    console.log('  XHR error:', e.message);
  }

  await new Promise(r => setTimeout(r, 2000));

  if (env.queryCapture.value) {
    console.log('\n=== 成功！Query 已捕获 ===');
    console.log(`Query: ${env.queryCapture.value}`);

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
    console.log('删除 $_ts.nsd 策略未生效');
    console.log('RS 可能通过其他方式检测页面模式');
    console.log('下一步：CDP 浏览器断点直接提取');
  }

  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
