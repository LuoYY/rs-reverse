/**
 * query_cdp_same_session.js — 同会话捕获 key + query + 用 RS AES 解密
 *
 * 关键改进：
 * 1. 在浏览器中同时捕获 16B key 和 query 值（同一会话）
 * 2. 用管线的 encryptMode1/encryptMode2 尝试解密
 * 3. 用所有捕获的 key 候选（16B, 20B, 21B）
 *
 * encryptMode1 = 加密（flag=1 带 IV，flag=0 不带 IV）
 * encryptMode2 = 解密（flag=1 剥离 IV，flag=0 不剥离）
 *
 * query 的 session_data (48B) 和 request_data (32B) 可能是 encryptMode1 的输出
 * 用 encryptMode2 可以解密
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeQuery(query) {
  var payload = query.startsWith('0') ? query.slice(1) : query;
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  var bytes = [], i = 0;
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

(async () => {
  console.log('=== 同会话 key + query 捕获 + RS AES 解密 ===\n');

  // Step 1: 浏览器捕获
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

  var queryValue = null;
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0 && !queryValue) {
      var qMatch = params.request.url.match(/r20SZOQm=([^&]+)/);
      queryValue = qMatch ? qMatch[1] : null;
    }
  });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 注入 hook
  console.log('[3] 注入 hook...');
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
            var ok = true;
            for (var i = 0; i < Math.min(3, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { ok = false; break; }
            }
            if (ok) window.__caps.push({ rl: result.length, d: result.slice(0,128).map(function(x){return x&0xFF;}), t: 'slice' });
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
            var ok = true;
            for (var i = 0; i < Math.min(3, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { ok = false; break; }
            }
            if (ok) window.__caps.push({ rl: result.length, d: result.slice(0,128).map(function(x){return x&0xFF;}), t: 'concat' });
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      return 'ok';
    })()`,
  });

  // 触发 POST
  console.log('[4] 触发 POST...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);

  // 获取捕获
  var caps = await client.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__caps || [])', returnByValue: true });
  var capsData = JSON.parse(caps.result.value);
  console.log('  捕获:', capsData.length, 'Query:', queryValue ? queryValue.substring(0, 40) + '...' : 'none');

  // 获取 cookie
  var cookieResult = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  var cookie = cookieResult.result.value;

  await browser.close();

  if (!queryValue) {
    console.log('FATAL: 无 query 捕获');
    process.exit(1);
  }

  // Step 2: 用管线解密
  console.log('\n[5] 用管线 RS AES 解密...');

  // 提取唯一 key
  var uniqueKeys = {};
  capsData.forEach(function(c) {
    var key = c.d.join(',');
    if (!uniqueKeys[key]) uniqueKeys[key] = { data: c.d, len: c.rl, type: c.t };
  });
  var allKeys = Object.values(uniqueKeys);
  console.log('  唯一数组:', allKeys.length);

  // 解码 query
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  console.log('  session_data (48B):', sessionData.map(b => b.toString(16).padStart(2,'0')).join(' '));
  console.log('  request_data (32B):', requestData.map(b => b.toString(16).padStart(2,'0')).join(' '));

  // 初始化管线
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var nsd = +m[1], cd = m[2];

  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var client2 = new PmosXjClientProxy();
  await client2.init();
  var cp3 = client2._extractCp3(nsd, cd);
  var ts2 = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  await client2._genCookie(ts2, cp3);

  var gv = require('@src/handler/globalVarible');
  var { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');

  console.log('  管线 keys16:', gv.keys[16].slice(0,16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('  管线 keys17:', gv.keys[17].slice(0,21).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));

  // 注意：浏览器会话和管线会话不同（nsd/cd 不同）
  // 所以管线 keys16/17 不能直接用于解密浏览器 query
  // 但我们可以用浏览器捕获的 key

  // 用所有捕获的 key 尝试 encryptMode2（解密）
  console.log('\n=== encryptMode2 (解密) ===');
  allKeys.forEach(function(k, ki) {
    if (k.len < 16) return;
    var key = k.data.slice(0, 16);
    
    [0, 1].forEach(function(flag) {
      try {
        var sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
          if (ascii > 0.5 || sDec.length < 10) {
            console.log('  ★ Key[' + ki + '] (' + k.len + 'B) session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
            console.log('    hex:', sDec.slice(0, 30).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
            console.log('    str:', Buffer.from(sDec.map(b=>b&0xFF)).toString('utf8').substring(0, 40));
          }
        }
      } catch(e) {}
      try {
        var rDec = encryptMode2([...requestData], key, flag);
        if (rDec && rDec.length > 0) {
          var ascii = rDec.filter(b => b >= 32 && b <= 126).length / rDec.length;
          if (ascii > 0.5 || rDec.length < 10) {
            console.log('  ★ Key[' + ki + '] (' + k.len + 'B) request f=' + flag + ': ' + rDec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
            console.log('    str:', Buffer.from(rDec.map(b=>b&0xFF)).toString('utf8').substring(0, 32));
          }
        }
      } catch(e) {}
    });
  });

  // 用所有捕获的 key 尝试 encryptMode1（加密 = 可能也是解密的逆操作）
  console.log('\n=== encryptMode1 (加密/逆操作) ===');
  allKeys.forEach(function(k, ki) {
    if (k.len < 16) return;
    var key = k.data.slice(0, 16);
    
    [0, 1].forEach(function(flag) {
      try {
        var sEnc = encryptMode1([...sessionData], key, flag);
        if (sEnc && sEnc.length > 0) {
          // encryptMode1 是加密，输出是密文
          // 但如果 query 用 encryptMode1 加密，那我们需要 encryptMode2 解密
          // 这里检查 encryptMode1 的输出是否与 query 匹配
          // 不太可能直接匹配，但检查一下
        }
      } catch(e) {}
    });
  });

  // 关键测试：用 21 字节 key（keys17 候选）
  console.log('\n=== 21B key (keys17 候选) ===');
  var keys21 = allKeys.filter(k => k.len === 21);
  console.log('  21B key 数量:', keys21.length);
  keys21.forEach(function(k, ki) {
    console.log('  [' + ki + ']:', k.data.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
    // keys17 是 21 字节，但 encryptMode2 的 key 参数应该用前 16 字节
    var key16 = k.data.slice(0, 16);
    [0, 1].forEach(function(flag) {
      try {
        var sDec = encryptMode2([...sessionData], key16, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
          if (ascii > 0.5) {
            console.log('    ★ session f=' + flag + ': ' + (ascii*100).toFixed(0) + '%');
            console.log('      str:', Buffer.from(sDec.map(b=>b&0xFF)).toString('utf8').substring(0, 40));
          }
        }
      } catch(e) {}
    });
  });

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/same-session-decrypt.json'),
    JSON.stringify({
      query: queryValue,
      queryBytes: qBytes,
      cookie: cookie,
      keys: allKeys.map(k => ({ len: k.len, data: k.data, type: k.type })),
    }, null, 2)
  );

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
