/**
 * 28 - 严格对照实验：同会话下浏览器真实 query vs 纯算法 query
 * 
 * 目标：
 * 1. 同会话捕获浏览器真实 query
 * 2. 用相同 keys 生成算法 query
 * 3. 逐字节对比找差异
 * 4. 分别发送两个 query，对比服务端响应
 */

const { chromium } = require('patchright');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup[str[i]], c1 = lookup[str[i + 1]], c2 = lookup[str[i + 2]], c3 = lookup[str[i + 3]];
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

function crc32(arr) {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  let v = -1;
  for (let i = 0; i < arr.length; i++) v = (v >>> 8) ^ t[(v ^ arr[i]) & 255];
  return (v ^ -1) >>> 0;
}

function httpsReq(opts, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(opts, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log('=== 28: 严格对照实验 ===\n');

  // [1] 启动浏览器
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  // [2] 加载页面
  console.log('[1] 加载页面...');
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // [3] 获取所有 cookie（包括 HttpOnly）
  const allCookies = await cdp.send('Network.getAllCookies');
  const oCookie = allCookies.cookies.find(c => c.name.endsWith('O'));
  const pCookie = allCookies.cookies.find(c => c.name.endsWith('P'));
  const cookieName = oCookie.name.slice(0, -1); // aoU85Lxl9xxN
  console.log(`  O cookie: ${oCookie.name} (${oCookie.value.length} chars)`);
  console.log(`  P cookie: ${pCookie.name} (${pCookie.value.length} chars)`);

  // [4] 获取 global 数组（keys）
  console.log('\n[2] 提取 keys...');
  const sendSrc = (await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  })).result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];

  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId;
    }
  }

  const dSrc = (await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function(){return Function.prototype.toString.call(this)}',
    returnByValue: true,
  })).result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32[1];

  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId;
  }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId;
    }
  }

  // 提取 keys[2], keys[17], keys[7]
  const keysR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var g30 = this[30];
      if (!g30) return JSON.stringify({error: "no global[30]"});
      return JSON.stringify({
        keys2: g30[2] ? Array.from(g30[2]) : null,
        keys16: g30[16] ? Array.from(g30[16]) : null,
        keys17: g30[17] ? Array.from(g30[17]) : null,
        keys7: g30[7] ? Array.from(g30[7]) : null,
        len: g30.length,
      });
    }`,
    returnByValue: true,
  });
  const keysData = JSON.parse(keysR.result.value);
  const keys2 = keysData.keys2;
  const keys17 = keysData.keys17;
  const k7str = String.fromCharCode(...keysData.keys7);
  const paramName = k7str.split(';')[1];
  console.log(`  keys[2]: ${keys2.length}B`);
  console.log(`  keys[17]: [${keys17.join(',')}]`);
  console.log(`  paramName: ${paramName}`);

  // [5] Hook 加密函数，捕获浏览器加密过程
  console.log('\n[3] Hook 加密函数...');
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var s = this;
      this.__encLog = [];
      [151, 165].forEach(function(i) {
        if (typeof s[i] !== "function") return;
        var orig = s[i];
        s[i] = function() {
          var args = Array.from(arguments);
          var entry = {
            idx: i,
            data: args[0] && Array.isArray(args[0]) ? Array.from(args[0]) : null,
            key: args[1] && Array.isArray(args[1]) ? Array.from(args[1]) : null,
            flag: args[2],
          };
          var result = orig.apply(this, arguments);
          entry.result = result && Array.isArray(result) ? Array.from(result) : null;
          s.__encLog.push(entry);
          return result;
        };
      });
      return "hooked";
    }`,
    returnByValue: true,
  });

  // [6] 触发浏览器请求，捕获真实 query
  console.log('\n[4] 触发浏览器请求...');
  const testUrl = '/px-gateway/GatewayConfig/security';

  // 捕获网络请求中的 query
  let realQuery = null;
  cdp.on('Network.requestWillBeSent', p => {
    const m = p.request.url.match(new RegExp(paramName + '=([^&]+)'));
    if (m && p.request.url.includes(testUrl)) {
      realQuery = m[1];
    }
  });

  const browserResult = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var x = new XMLHttpRequest();
      x.open("GET", "${testUrl}", false);
      x.send();
      return x.status + "|" + (x.responseURL || "");
    })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  const [browserStatus, responseUrl] = browserResult.result.value.split('|');
  console.log(`  浏览器请求状态: ${browserStatus}`);

  // 从 responseURL 提取 query
  if (!realQuery) {
    const qm = responseUrl.match(new RegExp(paramName + '=([^&]+)'));
    if (qm) realQuery = qm[1];
  }

  if (!realQuery) {
    console.log('  ❌ 未能捕获真实 query');
    await browser.close();
    return;
  }

  console.log(`  真实 query: ${realQuery.substring(0, 50)}... (${realQuery.length} chars)`);

  // [7] 读取加密日志
  const encLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){return JSON.stringify(this.__encLog || [])}',
    returnByValue: true,
  });
  const encLog = JSON.parse(encLogR.result.value);
  console.log(`  加密调用: ${encLog.length} 次`);

  // 找到 query 加密调用（data 长度 ~24，result 长度 ~32）
  const queryEnc = encLog.find(e => e.data && e.data.length >= 20 && e.data.length <= 30 && e.result && e.result.length >= 28 && e.result.length <= 40);
  if (queryEnc) {
    console.log(`  ★ Query 加密: ${queryEnc.data.length}B → ${queryEnc.result.length}B, flag=${queryEnc.flag}`);
    console.log(`    明文: [${queryEnc.data.join(',')}]`);
    console.log(`    密钥: [${queryEnc.key.join(',')}]`);
    console.log(`    密文: [${queryEnc.result.join(',')}]`);
  }

  // [8] 解码真实 query
  console.log('\n[5] 解码真实 query...');
  const realBytes = string2numarr(realQuery.substring(1)); // 去掉前缀 '0'
  console.log(`  真实 query 解码: ${realBytes.length}B`);
  console.log(`  CRC32 字节: [${realBytes.slice(0, 4).join(',')}]`);
  console.log(`  结构: [${realBytes[4]}, ${realBytes[5]}, ${realBytes[6]}]`);

  const realSessionData = realBytes.slice(7, 7 + realBytes[6]);
  const realRequestData = realBytes.slice(7 + realBytes[6] + 1);
  console.log(`  session_data: ${realSessionData.length}B`);
  console.log(`  request_data: ${realRequestData.length}B`);

  // 验证 CRC32
  const realPayload = realBytes.slice(4);
  const realCrc = crc32(realPayload);
  const realCrcBytes = [(realCrc >> 24) & 255, (realCrc >> 16) & 255, (realCrc >> 8) & 255, realCrc & 255];
  console.log(`  CRC32 验证: ${JSON.stringify(realCrcBytes) === JSON.stringify(realBytes.slice(0, 4)) ? '✅' : '❌'}`);

  // 验证 session_data == keys[2]
  console.log(`  session_data == keys[2]: ${JSON.stringify(realSessionData) === JSON.stringify(keys2) ? '✅' : '❌'}`);

  // [9] 用管线加密模块生成算法 query
  console.log('\n[6] 生成算法 query...');

  // 初始化管线加密
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const gv = require('@src/handler/globalVarible');
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');

  // 先用 encryptMode2 解密真实 query 的 request_data，得到真实明文
  const [arr21] = numarrAddTime([...keys17]);
  let realPlaintext;
  try {
    realPlaintext = encryptMode2([...realRequestData], [...arr21], 0);
    console.log(`  真实明文 (decryptMode2): [${realPlaintext.join(',')}]`);
    console.log(`  真实明文长度: ${realPlaintext.length}B`);
  } catch (e) {
    console.log(`  ❌ 解密真实 request_data 失败: ${e.message}`);
    // 尝试 flag=1
    try {
      realPlaintext = encryptMode2([...realRequestData], [...arr21], 1);
      console.log(`  真实明文 (flag=1): [${realPlaintext.join(',')}]`);
    } catch (e2) {
      console.log(`  ❌ flag=1 也失败: ${e2.message}`);
    }
  }

  // 也试直接用捕获的 key
  if (queryEnc && queryEnc.key) {
    try {
      const pt2 = encryptMode2([...realRequestData], [...queryEnc.key], 0);
      console.log(`  用捕获 key 解密: [${pt2.join(',')}]`);
    } catch (e) {
      console.log(`  捕获 key 解密失败: ${e.message}`);
    }
  }

  // 构造算法 query（使用真实明文结构）
  if (realPlaintext) {
    // 方法 A：完全复制真实明文
    const [arr21a] = numarrAddTime([...keys17]);
    const algoRequestData = encryptMode1([...realPlaintext], [...arr21a], 0);
    const algoPayload = [1, 0, keys2.length, ...keys2, algoRequestData.length, ...algoRequestData];
    const algoCrc = crc32(algoPayload);
    const algoBytes = [(algoCrc >> 24) & 255, (algoCrc >> 16) & 255, (algoCrc >> 8) & 255, algoCrc & 255, ...algoPayload];
    const algoQuery = '0' + numarr2string(algoBytes);

    console.log(`\n  算法 query (复制明文): ${algoQuery.substring(0, 50)}... (${algoQuery.length} chars)`);
    console.log(`  算法 query == 真实 query: ${algoQuery === realQuery ? '✅ 完全相同!' : '❌ 不同'}`);

    if (algoQuery !== realQuery) {
      // 逐字节对比
      const algoBytesDecoded = string2numarr(algoQuery.substring(1));
      console.log(`\n  逐字节对比 (${realBytes.length} vs ${algoBytesDecoded.length}):`);
      let diffs = 0;
      for (let i = 0; i < Math.max(realBytes.length, algoBytesDecoded.length); i++) {
        if (realBytes[i] !== algoBytesDecoded[i]) {
          console.log(`    [${i}] 真实=${realBytes[i]} 算法=${algoBytesDecoded[i]}`);
          diffs++;
          if (diffs > 20) { console.log('    ... (更多差异)'); break; }
        }
      }
      if (diffs === 0) console.log('    解码后完全相同（编码差异）');
    }

    // 方法 B：用随机 session_id 构造明文
    const sessionId = Array.from(crypto.randomBytes(13));
    const nonce = Array.from(crypto.randomBytes(3));
    const counter = realPlaintext ? ((realPlaintext[18] << 8) | realPlaintext[19]) + 2 : 3;
    const urlCrc = crc32([...testUrl.toUpperCase()].map(c => c.charCodeAt(0)));
    const myPlaintext = [
      ...sessionId,       // [0-12] 随机
      ...nonce,           // [13-15] 随机
      183,                // [16] 常量
      realPlaintext ? realPlaintext[17] : 0,  // [17] 会话常量
      (counter >> 8) & 255, counter & 255,    // [18-19] 计数器
      (urlCrc >> 24) & 255, (urlCrc >> 16) & 255, (urlCrc >> 8) & 255, urlCrc & 255, // [20-23]
    ];

    const [arr21b] = numarrAddTime([...keys17]);
    const myRequestData = encryptMode1([...myPlaintext], [...arr21b], 0);
    const myPayload = [1, 0, keys2.length, ...keys2, myRequestData.length, ...myRequestData];
    const myCrc = crc32(myPayload);
    const myBytes = [(myCrc >> 24) & 255, (myCrc >> 16) & 255, (myCrc >> 8) & 255, myCrc & 255, ...myPayload];
    const myQuery = '0' + numarr2string(myBytes);

    console.log(`\n  算法 query (随机明文): ${myQuery.substring(0, 50)}... (${myQuery.length} chars)`);

    // [10] 发送对照请求
    console.log('\n[7] 对照请求测试...');
    const cookieHeader = `${oCookie.name}=${oCookie.value}; ${pCookie.name}=${pCookie.value}`;

    // 测试 A: 浏览器真实 query
    const resA = await httpsReq({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
      path: `${testUrl}?${paramName}=${realQuery}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
      },
      rejectUnauthorized: false,
    });
    console.log(`  A) 真实 query: ${resA.status} (${resA.body.length}B)`);

    // 测试 B: 算法 query（复制明文）
    const resB = await httpsReq({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
      path: `${testUrl}?${paramName}=${algoQuery}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
      },
      rejectUnauthorized: false,
    });
    console.log(`  B) 算法 query (复制明文): ${resB.status} (${resB.body.length}B)`);

    // 测试 C: 算法 query（随机明文）
    const resC = await httpsReq({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
      path: `${testUrl}?${paramName}=${myQuery}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
      },
      rejectUnauthorized: false,
    });
    console.log(`  C) 算法 query (随机明文): ${resC.status} (${resC.body.length}B)`);

    // 测试 D: 篡改真实 query（改一个字符）
    const tamperedQuery = realQuery.substring(0, 10) + (realQuery[10] === 'a' ? 'b' : 'a') + realQuery.substring(11);
    const resD = await httpsReq({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
      path: `${testUrl}?${paramName}=${tamperedQuery}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
      },
      rejectUnauthorized: false,
    });
    console.log(`  D) 篡改 query: ${resD.status} (${resD.body.length}B)`);

    // 测试 E: 无 query
    const resE = await httpsReq({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
      path: testUrl,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
      },
      rejectUnauthorized: false,
    });
    console.log(`  E) 无 query: ${resE.status} (${resE.body.length}B)`);

    // 测试 F: POST 无 query
    const resF = await httpsReq({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
      path: '/px-gateway/GatewayConfig/getGatewayConfig',
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Content-Type': 'application/json;charset=UTF-8',
        'Cookie': cookieHeader,
        'Accept': 'application/json, text/plain, */*',
      },
      rejectUnauthorized: false,
    }, '{}');
    console.log(`  F) POST 无 query: ${resF.status} (${resF.body.length}B)`);

    // 测试 G: POST 真实 query（需要浏览器先生成一个 POST 的 query）
    // 先用浏览器触发 POST
    console.log('\n[8] 浏览器 POST 对照...');
    const postUrl = '/px-gateway/GatewayConfig/getGatewayConfig';

    let postQuery = null;
    cdp.on('Network.requestWillBeSent', p => {
      const m = p.request.url.match(new RegExp(paramName + '=([^&]+)'));
      if (m && p.request.url.includes('getGatewayConfig')) {
        postQuery = m[1];
      }
    });

    const postResult = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        var x = new XMLHttpRequest();
        x.open("POST", "${postUrl}", false);
        x.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        x.send("{}");
        return x.status + "|" + (x.responseURL || "");
      })()`,
      returnByValue: true,
    });
    await page.waitForTimeout(1000);

    const [postStatus] = postResult.result.value.split('|');
    console.log(`  浏览器 POST 状态: ${postStatus}`);

    if (!postQuery) {
      const pqm = postResult.result.value.split('|')[1]?.match(new RegExp(paramName + '=([^&]+)'));
      if (pqm) postQuery = pqm[1];
    }

    if (postQuery) {
      console.log(`  POST 真实 query: ${postQuery.substring(0, 50)}...`);

      // 用真实 POST query 从 Node 发
      const resG = await httpsReq({
        hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
        path: `${postUrl}?${paramName}=${postQuery}`,
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Content-Type': 'application/json;charset=UTF-8',
          'Cookie': cookieHeader,
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
          'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
        },
        rejectUnauthorized: false,
      }, '{}');
      console.log(`  G) POST 真实 query (Node): ${resG.status} (${resG.body.length}B)`);
      if (resG.body.length < 500) console.log(`    body: ${resG.body.substring(0, 200)}`);

      // 解密 POST query 的 request_data
      const postBytes = string2numarr(postQuery.substring(1));
      const postSdLen = postBytes[6];
      const postRd = postBytes.slice(7 + postSdLen + 1);
      try {
        const [arr21p] = numarrAddTime([...keys17]);
        const postPt = encryptMode2([...postRd], [...arr21p], 0);
        console.log(`  POST 明文: [${postPt.join(',')}]`);
        console.log(`  POST 明文 CRC32(URL): 0x${((postPt[20] << 24) | (postPt[21] << 16) | (postPt[22] << 8) | postPt[23]).toString(16)}`);
        const expectedCrc = crc32([...postUrl.toUpperCase()].map(c => c.charCodeAt(0)));
        console.log(`  期望 CRC32: 0x${expectedCrc.toString(16)}`);
      } catch (e) {
        console.log(`  POST 明文解密失败: ${e.message}`);
      }

      // 生成算法 POST query
      const postUrlCrc = crc32([...postUrl.toUpperCase()].map(c => c.charCodeAt(0)));
      const postSessionId = Array.from(crypto.randomBytes(13));
      const postNonce = Array.from(crypto.randomBytes(3));
      const postCounter = 5;
      const postPlaintext = [
        ...postSessionId, ...postNonce, 183, 0,
        (postCounter >> 8) & 255, postCounter & 255,
        (postUrlCrc >> 24) & 255, (postUrlCrc >> 16) & 255, (postUrlCrc >> 8) & 255, postUrlCrc & 255,
      ];
      const [arr21post] = numarrAddTime([...keys17]);
      const postAlgoRd = encryptMode1([...postPlaintext], [...arr21post], 0);
      const postAlgoPayload = [1, 0, keys2.length, ...keys2, postAlgoRd.length, ...postAlgoRd];
      const postAlgoCrc = crc32(postAlgoPayload);
      const postAlgoBytes = [(postAlgoCrc >> 24) & 255, (postAlgoCrc >> 16) & 255, (postAlgoCrc >> 8) & 255, postAlgoCrc & 255, ...postAlgoPayload];
      const postAlgoQuery = '0' + numarr2string(postAlgoBytes);

      const resH = await httpsReq({
        hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
        path: `${postUrl}?${paramName}=${postAlgoQuery}`,
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Content-Type': 'application/json;charset=UTF-8',
          'Cookie': cookieHeader,
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
          'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
        },
        rejectUnauthorized: false,
      }, '{}');
      console.log(`  H) POST 算法 query (Node): ${resH.status} (${resH.body.length}B)`);
      if (resH.body.length < 500) console.log(`    body: ${resH.body.substring(0, 200)}`);

      // 篡改 POST query
      const tamperedPost = postQuery.substring(0, 10) + (postQuery[10] === 'a' ? 'b' : 'a') + postQuery.substring(11);
      const resI = await httpsReq({
        hostname: 'pmos.xj.sgcc.com.cn', port: 20080,
        path: `${postUrl}?${paramName}=${tamperedPost}`,
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Content-Type': 'application/json;charset=UTF-8',
          'Cookie': cookieHeader,
          'Accept': 'application/json, text/plain, */*',
        },
        rejectUnauthorized: false,
      }, '{}');
      console.log(`  I) POST 篡改 query: ${resI.status} (${resI.body.length}B)`);
    }

    // 总结
    console.log('\n=== 对照总结 ===');
    console.log(`  GET  真实 query:  ${resA.status}`);
    console.log(`  GET  算法(复制):  ${resB.status}`);
    console.log(`  GET  算法(随机):  ${resC.status}`);
    console.log(`  GET  篡改 query:  ${resD.status}`);
    console.log(`  GET  无 query:    ${resE.status}`);
    console.log(`  POST 无 query:    ${resF.status}`);
  }

  await browser.close();
  console.log('\n=== 完成 ===');
})().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
