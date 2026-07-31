/**
 * query_final_v2.js — S-Box 站点固定确认后的最终突破
 *
 * ★★★ S-Box 是站点固定的！★★★
 * 管线 cfgnum 可以用于任何会话的 query！
 *
 * 只需要：同会话的加密密钥 + 管线 encryptMode2
 *
 * 方法：
 * 1. 浏览器加载 → reload → RS 初始化
 * 2. 注入 Array.prototype.slice hook（捕获 16B key）
 * 3. 触发 POST → 捕获 key + query
 * 4. 用管线 encryptMode2(key) 解密 query
 * 5. 如果解密成功 → 用管线 encryptMode1(key) 生成新 query
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
  return bytes;
}

(async () => {
  console.log('=== 最终突破 v2：S-Box 固定 + 同会话密钥 ===\n');

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
  var triggerResult = await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); return x.status; } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });
  console.log('  Status:', triggerResult.result.value);

  await page.waitForTimeout(500);

  // 获取 query（如果 Network 没捕获到）
  if (!queryValue) {
    var urlResult = await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); var m = (x.responseURL||'').match(/r20SZOQm=([^&]+)/); return m ? m[1] : ''; } catch(e) { return ''; } })()`,
      returnByValue: true,
    });
    queryValue = urlResult.result.value;
  }
  console.log('  Query:', queryValue ? queryValue.substring(0, 60) + '...' : 'NONE');

  // 获取捕获的 key
  var caps = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__caps || [])',
    returnByValue: true,
  });
  var capsData = JSON.parse(caps.result.value);
  
  // 提取唯一 16B key
  var seen = new Set();
  var uniqueKeys = [];
  capsData.forEach(function(c) {
    if (c.rl === 16) {
      var key = c.d.join(',');
      if (!seen.has(key)) { seen.add(key); uniqueKeys.push(c.d); }
    }
  });
  console.log('  捕获 16B key:', uniqueKeys.length);
  uniqueKeys.forEach(function(k, i) {
    console.log('    [' + i + ']:', k.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  });

  await browser.close();

  if (!queryValue || uniqueKeys.length === 0) {
    console.log('FATAL: 缺少 query 或 key');
    process.exit(1);
  }

  // Step 5: 用管线解密
  console.log('\n[5] 用管线 encryptMode2 解密...');
  
  // 初始化管线（获取 cfgnum）
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: UA });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var cp3 = pipeClient._extractCp3(+m[1], m[2]);
  await pipeClient._genCookie({ nsd: +m[1], cd: m[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  
  console.log('  管线 S-Box[0:4]:', gv.cfgnum[0][0].slice(0, 4).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  console.log('  session_data (48B):', sessionData.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  console.log('  request_data (32B):', requestData.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  
  // 用每个 key 尝试解密
  var bestResult = { ascii: 0 };
  
  uniqueKeys.forEach(function(key, ki) {
    console.log('\n  Key[' + ki + ']:', key.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
    
    [0, 1].forEach(function(flag) {
      try {
        var sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
          console.log('    session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii * 100).toFixed(0) + '% ASCII');
          if (ascii > bestResult.ascii) {
            bestResult = { ascii, key: ki, target: 'session', flag, result: sDec, keyData: key };
          }
          if (ascii > 0.5 || sDec.length < 10) {
            console.log('      hex:', sDec.slice(0, 30).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('      str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 40));
          }
        }
      } catch(e) {}
      
      try {
        var rDec = encryptMode2([...requestData], key, flag);
        if (rDec && rDec.length > 0) {
          var ascii = rDec.filter(function(b) { return b >= 32 && b <= 126; }).length / rDec.length;
          console.log('    request f=' + flag + ': ' + rDec.length + 'B, ' + (ascii * 100).toFixed(0) + '% ASCII');
          if (ascii > bestResult.ascii) {
            bestResult = { ascii, key: ki, target: 'request', flag, result: rDec, keyData: key };
          }
          if (ascii > 0.5 || rDec.length < 10) {
            console.log('      str:', Buffer.from(rDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 32));
          }
        }
      } catch(e) {}
    });
  });
  
  console.log('\n=== 最佳结果 ===');
  console.log('ASCII:', (bestResult.ascii * 100).toFixed(1) + '%');
  console.log('Key[' + bestResult.key + ']:', bestResult.keyData ? bestResult.keyData.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' ') : 'none');
  console.log('Target:', bestResult.target, 'flag:', bestResult.flag);
  if (bestResult.result) {
    console.log('Result hex:', bestResult.result.slice(0, 40).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
    console.log('Result str:', Buffer.from(bestResult.result.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 40));
  }
  
  // 如果 ASCII > 60%，可能是有效解密
  if (bestResult.ascii > 0.6) {
    console.log('\n★★★ 可能是有效解密！ ★★★');
  } else {
    console.log('\n解密结果 ASCII 偏低（< 60%）');
    console.log('可能原因：');
    console.log('1. 密钥不正确（16B key 可能不是 AES 密钥而是其他数据）');
    console.log('2. query 加密在 AES 之前/之后有额外步骤');
    console.log('3. query 的 AES 模式与 encryptMode1/2 不同');
  }
  
  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/final-v2-results.json'),
    JSON.stringify({
      query: queryValue,
      queryBytes: qBytes,
      keys: uniqueKeys,
      bestResult: { ascii: bestResult.ascii, key: bestResult.key, target: bestResult.target, flag: bestResult.flag },
    }, null, 2)
  );
  
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
