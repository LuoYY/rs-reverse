/**
 * query_cdp_keygen4.js — 用捕获的 key [1] 解密 query + 捕获更多中间值
 *
 * 突破：捕获到 4 个 16 字节 key！
 * [0] 6d 78 67 63 63 30 80 00... — 结构化（可能是 IV 或 nonce 相关）
 * [1] a6 92 ea c1 2b 5d fc 7d... — 随机（query 专用密钥候选！）
 * [2] 15 90 a8 b3 54 fd c3 4b... — keys16（cookie 已知密钥）
 * [3] b4 e7 10 30 51 87 44 20... — 常量池值
 *
 * 策略：
 * 1. 用 key [1] 尝试 AES-CBC 解密 session_data 和 request_data
 * 2. 同时捕获更多中间值（扩展 hook 范围到 8-128 字节）
 * 3. 捕获 nonce + key 的组合
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const crypto = require('crypto');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeQuery(query) {
  var payload = query.startsWith('0') ? query.slice(1) : query;
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  var bytes = [];
  var i = 0;
  var full = Math.floor(payload.length / 4);
  for (var g = 0; g < full; g++) {
    var c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4;
    bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  var rem = payload.length - i;
  if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem === 3) { bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4)); bytes.push(((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2)); }
  return bytes;
}

function aesDecrypt(key, iv, data, mode) {
  try {
    var d = crypto.createDecipheriv(mode, Buffer.from(key), Buffer.from(iv));
    d.setAutoPadding(false);
    return Buffer.concat([d.update(Buffer.from(data)), d.final()]);
  } catch(e) { return null; }
}

function asciiRatio(buf) {
  return [...buf].filter(b => b >= 32 && b <= 126).length / buf.length;
}

(async () => {
  console.log('=== 用捕获的 key 解密 query ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  var queryRequests = [];
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0) {
      var qMatch = params.request.url.match(/r20SZOQm=([^&]+)/);
      queryRequests.push({ query: qMatch ? qMatch[1] : '', path: params.request.url.split('?')[0] });
    }
  });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 注入更全面的 hook
  console.log('\n[3] 注入全面 hook...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){
      window.__caps = [];
      var __inHook = false;
      
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        var result = origSlice.apply(this, arguments);
        if (!__inHook && result.length >= 8 && result.length <= 128) {
          __inHook = true;
          try {
            var allNum = true;
            for (var i = 0; i < Math.min(3, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
            }
            if (allNum) {
              window.__caps.push({ t: 'slice', fl: this.length, rl: result.length, d: result.slice(0,128).map(function(x){return x&0xFF;}), s: arguments[0], e: arguments[1] });
            }
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        var result = origConcat.apply(this, arguments);
        if (!__inHook && result.length >= 8 && result.length <= 128) {
          __inHook = true;
          try {
            var allNum = true;
            for (var i = 0; i < Math.min(3, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
            }
            if (allNum) {
              window.__caps.push({ t: 'concat', rl: result.length, d: result.slice(0,128).map(function(x){return x&0xFF;}) });
            }
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      return 'ok';
    })()`,
    returnByValue: true,
  });

  // 触发 POST
  console.log('[4] 触发 POST...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.setRequestHeader('Content-Type','application/json'); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);

  // 获取捕获
  var caps = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__caps || [])',
    returnByValue: true,
  });
  var capsData = JSON.parse(caps.result.value);
  console.log('  捕获:', capsData.length);

  // 获取最后一个 query
  if (queryRequests.length === 0) {
    console.log('  无 query 请求');
    process.exit(0);
  }
  var lastQuery = queryRequests[queryRequests.length - 1].query;
  var qBytes = decodeQuery(lastQuery);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  var nonce = qBytes.slice(0, 4);

  console.log('\n  Query bytes (88):', qBytes.map(b => b.toString(16).padStart(2,'0')).join(' '));
  console.log('  Session (48B):', sessionData.map(b => b.toString(16).padStart(2,'0')).join(' '));
  console.log('  Request (32B):', requestData.map(b => b.toString(16).padStart(2,'0')).join(' '));

  // 提取所有唯一的 16 字节 key
  var arr16 = capsData.filter(c => c.rl === 16);
  var seen = new Set();
  var uniqueKeys = [];
  arr16.forEach(c => {
    var key = c.d.join(',');
    if (!seen.has(key)) { seen.add(key); uniqueKeys.push(c.d); }
  });
  console.log('\n  唯一 16B key:', uniqueKeys.length);

  // 也提取其他大小的数组
  [8, 12, 16, 20, 24, 32, 48, 64, 88].forEach(len => {
    var arrs = capsData.filter(c => c.rl === len);
    var seenLen = new Set();
    var unique = [];
    arrs.forEach(c => {
      var key = c.d.join(',');
      if (!seenLen.has(key)) { seenLen.add(key); unique.push(c); }
    });
    if (unique.length > 0) {
      console.log('  ' + len + 'B: ' + unique.length + ' unique');
    }
  });

  // 用所有 16B key 尝试 AES-CBC/ECB 解密
  console.log('\n=== AES 解密尝试 ===');

  // IV 候选
  var ivCandidates = [
    { name: 'zeros', iv: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
    { name: 'nonce_pad', iv: [...nonce, 0,0,0,0,0,0,0,0,0,0,0,0] },
    { name: 'nonce_rep', iv: [...nonce, ...nonce, ...nonce, ...nonce] },
  ];

  var bestResult = { ascii: 0 };

  uniqueKeys.forEach((key, ki) => {
    ivCandidates.forEach(({ name: iName, iv }) => {
      // AES-128-CBC session
      var result = aesDecrypt(key, iv, sessionData, 'aes-128-cbc');
      if (result) {
        var ascii = asciiRatio(result);
        if (ascii > 0.6) {
          console.log(`  ★ Key[${ki}] session CBC ${iName}: ${(ascii*100).toFixed(0)}% ASCII`);
          console.log(`    "${result.toString('utf8').substring(0,48)}"`);
        }
        if (ascii > bestResult.ascii) bestResult = { ascii, key: ki, iv: iName, target: 'session', result };
      }

      // AES-128-CBC request
      result = aesDecrypt(key, iv, requestData, 'aes-128-cbc');
      if (result) {
        var ascii = asciiRatio(result);
        if (ascii > 0.6) {
          console.log(`  ★ Key[${ki}] request CBC ${iName}: ${(ascii*100).toFixed(0)}% ASCII`);
          console.log(`    "${result.toString('utf8').substring(0,32)}"`);
        }
        if (ascii > bestResult.ascii) bestResult = { ascii, key: ki, iv: iName, target: 'request', result };
      }
    });

    // AES-128-ECB session
    var result = aesDecrypt(key, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], sessionData, 'aes-128-ecb');
    if (result) {
      var ascii = asciiRatio(result);
      if (ascii > 0.6) {
        console.log(`  ★ Key[${ki}] session ECB: ${(ascii*100).toFixed(0)}% ASCII`);
        console.log(`    "${result.toString('utf8').substring(0,48)}"`);
      }
    }

    // AES-128-ECB request
    result = aesDecrypt(key, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], requestData, 'aes-128-ecb');
    if (result) {
      var ascii = asciiRatio(result);
      if (ascii > 0.6) {
        console.log(`  ★ Key[${ki}] request ECB: ${(ascii*100).toFixed(0)}% ASCII`);
        console.log(`    "${result.toString('utf8').substring(0,32)}"`);
      }
    }
  });

  console.log('\n  最佳结果:', (bestResult.ascii * 100).toFixed(1) + '%');

  // 同时尝试 32 字节 key（AES-256）
  var arr32 = capsData.filter(c => c.rl === 32);
  var seen32 = new Set();
  var unique32 = [];
  arr32.forEach(c => {
    var key = c.d.join(',');
    if (!seen32.has(key)) { seen32.add(key); unique32.push(c.d); }
  });
  
  if (unique32.length > 0) {
    console.log('\n=== AES-256 尝试 ===');
    console.log('  32B key 候选:', unique32.length);
    unique32.forEach((key, ki) => {
      var result = aesDecrypt(key, [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], sessionData, 'aes-256-cbc');
      if (result) {
        var ascii = asciiRatio(result);
        if (ascii > 0.6) {
          console.log(`  ★ 32BKey[${ki}] session: ${(ascii*100).toFixed(0)}% ASCII`);
          console.log(`    "${result.toString('utf8').substring(0,48)}"`);
        }
      }
    });
  }

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/keygen-v4-results.json'),
    JSON.stringify({
      query: lastQuery,
      queryBytes: qBytes,
      keys16: uniqueKeys,
      keys32: unique32,
      allCaps: capsData.slice(0, 300),
      bestResult: bestResult.ascii,
    }, null, 2)
  );

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
