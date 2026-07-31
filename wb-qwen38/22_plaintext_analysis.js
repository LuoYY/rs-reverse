/**
 * 22_plaintext_analysis.js
 * 
 * 深入分析 24 字节明文结构：
 * 1. 捕获更多请求（不同 URL、不同 body）来推断字段含义
 * 2. 分析 bytes[0-12] 会话标识的来源
 * 3. 分析 bytes[13-15] 请求相关数据
 * 4. 分析 byte[19] 计数器
 * 5. 捕获 session_data 的生成过程
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  // 捕获 query
  const queries = [];
  cdp.on('Network.requestWillBeSent', p => {
    const m = p.request.url.match(/r20SZOQm=([^&]+)/);
    if (m) queries.push({ url: p.request.url.substring(0, 120), method: p.request.method, query: m[1] });
  });
  
  console.log('[1] 加载...');
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  // 验证
  await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  console.log('[2] 验证完成');
  
  // 获取 global 数组（复用之前的逻辑）
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  
  const dSrcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32[1];
  
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId;
    }
  }
  
  // Hook 加密函数
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var self = this;
      this.__encLogFull = [];
      [151, 165].forEach(function(idx) {
        if (typeof self[idx] !== 'function') return;
        var orig = self[idx];
        self[idx] = function() {
          var args = Array.from(arguments);
          var entry = {
            idx: idx,
            data: args[0] && Array.isArray(args[0]) ? Array.from(args[0]) : null,
            key: args[1] && Array.isArray(args[1]) ? Array.from(args[1]) : null,
            flag: args[2],
          };
          var result = orig.apply(this, arguments);
          entry.result = result && Array.isArray(result) ? Array.from(result) : null;
          self.__encLogFull.push(entry);
          return result;
        };
      });
      return 'ok';
    }`,
    returnByValue: true,
  });
  console.log('[3] Hook 完成');
  
  // [4] 发送多种请求
  console.log('\n[4] 发送多种请求...');
  
  const requests = [
    { method: 'GET', path: '/px-gateway/GatewayConfig/security' },
    { method: 'POST', path: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { method: 'POST', path: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
    { method: 'POST', path: '/px-common-authcenter/auth/v2/verifyType/get', body: '{}' },
    { method: 'POST', path: '/px-common-authority/marketMapping/selectByCondition', body: '{"data":{},"pageInfo":{"pageSize":10,"pageNum":1}}' },
    { method: 'GET', path: '/px-gateway/GatewayConfig/security' },  // 重复 GET
    { method: 'POST', path: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{"test":"different_body"}' },  // 不同 body
  ];
  
  for (const req of requests) {
    if (req.method === 'GET') {
      await cdp.send('Runtime.evaluate', {
        expression: `(function(){var x=new XMLHttpRequest();x.open("GET","${req.path}",false);x.send();return x.status})()`,
        returnByValue: true,
      });
    } else {
      await cdp.send('Runtime.evaluate', {
        expression: `(function(){var x=new XMLHttpRequest();x.open("POST","${req.path}",false);x.setRequestHeader("Content-Type","application/json;charset=UTF-8");x.send(${JSON.stringify(req.body || '{}')});return x.status})()`,
        returnByValue: true,
      });
    }
  }
  console.log(`  ${requests.length} 个请求完成`);
  
  // [5] 读取加密日志
  const encLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function() { return JSON.stringify(this.__encLogFull || []); }',
    returnByValue: true,
  });
  const encLog = JSON.parse(encLogR.result.value);
  
  // 分离 query 加密调用（data.length === 24）
  const queryEncCalls = encLog.filter(e => e.data?.length === 24);
  console.log(`\n[5] Query 加密调用: ${queryEncCalls.length} 次`);
  
  // 分析明文
  console.log('\n--- 明文对比 ---');
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  
  function crc32(arr) {
    const t = new Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    let v = -1;
    for (let i = 0; i < arr.length; i++) v = (v >>> 8) ^ t[(v ^ arr[i]) & 255];
    return (v ^ -1) >>> 0;
  }
  
  for (let i = 0; i < queryEncCalls.length; i++) {
    const pt = queryEncCalls[i].data;
    const req = requests[i] || {};
    
    // 计算 CRC32(URL.toUpperCase())
    const urlUpper = (req.path || '').toUpperCase();
    const urlBytes = [...urlUpper].map(c => c.charCodeAt(0));
    const urlCrc = crc32(urlBytes);
    
    // 检查 bytes[20-23]
    const ptCrc = ((pt[20] << 24) | (pt[21] << 16) | (pt[22] << 8) | pt[23]) >>> 0;
    
    console.log(`\n  Q[${i}] ${req.method || '?'} ${req.path || '?'}`);
    console.log(`    明文: [${pt.join(',')}]`);
    console.log(`    bytes[0-12] (会话ID): [${pt.slice(0, 13).join(',')}]`);
    console.log(`    bytes[13-15] (请求): [${pt.slice(13, 16).join(',')}]`);
    console.log(`    bytes[16-18] (常量): [${pt.slice(16, 19).join(',')}]`);
    console.log(`    byte[19] (计数器): ${pt[19]}`);
    console.log(`    bytes[20-23] (CRC32): 0x${ptCrc.toString(16).padStart(8, '0')}`);
    console.log(`    CRC32(URL.upper): 0x${urlCrc.toString(16).padStart(8, '0')} ${ptCrc === urlCrc ? '✅' : '❌'}`);
    
    if (req.body) {
      // 检查 body 是否影响明文
      const bodyCrc = crc32([...req.body].map(c => c.charCodeAt(0)));
      console.log(`    CRC32(body): 0x${bodyCrc.toString(16).padStart(8, '0')}`);
    }
  }
  
  // [6] 分析固定部分
  console.log('\n--- 固定/变化分析 ---');
  if (queryEncCalls.length >= 2) {
    const ref = queryEncCalls[0].data;
    for (let byteIdx = 0; byteIdx < 24; byteIdx++) {
      const values = queryEncCalls.map(q => q.data[byteIdx]);
      const unique = new Set(values);
      if (unique.size === 1) {
        // 固定
      } else {
        console.log(`  byte[${byteIdx}]: 变化 ${[...unique].join(',')} (${unique.size} 种)`);
      }
    }
  }
  
  // [7] 解码 query 获取 session_data
  console.log('\n--- Session Data ---');
  if (queries.length > 0) {
    function string2numarr(str) {
      const keys = basestr.split('');
      const lookup = {};
      keys.forEach((ch, idx) => { lookup[ch] = idx; });
      const ans = [];
      for (let i = 0; i < str.length; i += 4) {
        const c0 = lookup[str[i]], c1 = lookup[str[i+1]], c2 = lookup[str[i+2]], c3 = lookup[str[i+3]];
        if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
        if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
        if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
      }
      return ans;
    }
    
    const q0bytes = string2numarr(queries[0].query.substring(1));
    const sessionData = q0bytes.slice(7, 55);
    console.log(`  session_data (48B): [${sessionData.join(',')}]`);
    console.log(`  hex: ${sessionData.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // 检查所有 query 的 session_data 是否相同
    const allSame = queries.every(q => {
      const qb = string2numarr(q.query.substring(1));
      const sd = qb.slice(7, 55);
      return sd.every((b, i) => b === sessionData[i]);
    });
    console.log(`  所有 query session_data 相同: ${allSame ? '✅' : '❌'}`);
  }
  
  // 保存
  fs.writeFileSync(path.join(OUT, 'plaintext_analysis.json'), JSON.stringify({
    queryEncCalls: queryEncCalls.map(q => ({ data: q.data, key: q.key, result: q.result })),
    queries: queries.map(q => ({ url: q.url, method: q.method, query: q.query })),
    requests,
  }, null, 2));
  console.log('\n[8] 保存到 captures/plaintext_analysis.json');
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
