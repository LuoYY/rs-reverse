/**
 * query_key_hunt.js — 暴力搜索正确的 query 加密密钥
 *
 * 问题：Array.prototype.slice hook 捕获的 4 个 16B key 都不对
 * 原因：密钥可能不以 16 字节数组形式经过 slice/concat
 *
 * 新方法：
 * 1. 在浏览器中 hook MORE 操作（map, filter, forEach, from, etc.）
 * 2. 捕获所有 16 字节的数字数组（无论经过什么操作）
 * 3. 用管线 encryptMode2 逐个测试
 * 4. 找到使解密结果 padding 合理（1-16）的 key
 *
 * 同时：
 * 5. 捕获 4 字节的 uint32 数组（AES 轮密钥单元）
 * 6. 将 4 个 uint32 组合成 16 字节 key
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
  console.log('=== 暴力搜索 query 加密密钥 ===\n');

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

  // 注入更全面的 hook
  console.log('[3] 注入全面 hook...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){
      window.__caps = [];
      var __inHook = false;
      
      function captureArr(arr, source) {
        if (!arr || !arr.length) return;
        if (arr.length < 4 || arr.length > 128) return;
        var allNum = true;
        for (var i = 0; i < Math.min(3, arr.length); i++) {
          if (typeof arr[i] !== 'number' || isNaN(arr[i])) { allNum = false; break; }
        }
        if (allNum) {
          window.__caps.push({
            rl: arr.length,
            d: Array.prototype.slice.call(arr, 0, 128).map(function(x){return x&0xFF;}),
            t: source,
          });
        }
      }
      
      // Hook slice
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        var result = origSlice.apply(this, arguments);
        if (!__inHook) { __inHook = true; try { captureArr(result, 'slice'); } catch(e){} __inHook = false; }
        return result;
      };
      
      // Hook concat
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        var result = origConcat.apply(this, arguments);
        if (!__inHook) { __inHook = true; try { captureArr(result, 'concat'); } catch(e){} __inHook = false; }
        return result;
      };
      
      // Hook Array.from
      var origFrom = Array.from;
      Array.from = function() {
        var result = origFrom.apply(this, arguments);
        if (!__inHook) { __inHook = true; try { captureArr(result, 'from'); } catch(e){} __inHook = false; }
        return result;
      };
      
      // Hook map（捕获中间结果）
      var origMap = Array.prototype.map;
      Array.prototype.map = function() {
        var result = origMap.apply(this, arguments);
        if (!__inHook) { __inHook = true; try { captureArr(this, 'map_this'); captureArr(result, 'map_result'); } catch(e){} __inHook = false; }
        return result;
      };
      
      // Hook Uint8Array constructor
      var OrigU8 = Uint8Array;
      window.__origU8 = OrigU8;
      // 不能替换 Uint8Array（RS 可能保存了引用）
      
      return 'hooks installed';
    })()`,
  });

  // 触发 POST
  console.log('[4] 触发 POST...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);

  if (!queryValue) {
    var urlResult = await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); var m = (x.responseURL||'').match(/r20SZOQm=([^&]+)/); return m ? m[1] : ''; } catch(e) { return ''; } })()`,
      returnByValue: true,
    });
    queryValue = urlResult.result.value;
  }
  console.log('  Query:', queryValue ? queryValue.substring(0, 60) + '...' : 'NONE');

  // 获取捕获
  var caps = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__caps || [])',
    returnByValue: true,
  });
  var capsData = JSON.parse(caps.result.value);
  console.log('  捕获数组:', capsData.length);
  
  // 去重
  var seen = new Set();
  var unique = [];
  capsData.forEach(function(c) {
    var key = c.d.join(',');
    if (!seen.has(key)) { seen.add(key); unique.push(c); }
  });
  console.log('  唯一数组:', unique.length);

  await browser.close();

  if (!queryValue || queryValue.length < 10) {
    console.log('FATAL: 无 query');
    process.exit(1);
  }

  // 初始化管线
  console.log('\n[5] 初始化管线...');
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: UA });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var cp3 = pipeClient._extractCp3(+m[1], m[2]);
  await pipeClient._genCookie({ nsd: +m[1], cd: m[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  // 暴力测试所有 16 字节数组
  console.log('\n[6] 暴力测试所有 16B 数组...');
  
  var valid16 = unique.filter(function(c) { return c.rl === 16; });
  console.log('  16B 数组:', valid16.length);
  
  var found = false;
  
  for (var ki = 0; ki < valid16.length; ki++) {
    var key = valid16[ki].d;
    
    for (var flag = 0; flag <= 1; flag++) {
      // session
      try {
        var sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
          if (ascii > 0.6) {
            console.log('  ★★★ Key[' + ki + '] session f=' + flag + ': ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
            console.log('    key:', key.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('    str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 48));
            found = true;
          }
        }
      } catch(e) {}
      
      // request
      try {
        var rDec = encryptMode2([...requestData], key, flag);
        if (rDec && rDec.length > 0) {
          var ascii = rDec.filter(function(b) { return b >= 32 && b <= 126; }).length / rDec.length;
          if (ascii > 0.6) {
            console.log('  ★★★ Key[' + ki + '] request f=' + flag + ': ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
            console.log('    key:', key.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('    str:', Buffer.from(rDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 32));
            found = true;
          }
        }
      } catch(e) {}
    }
  }
  
  // 也测试 21 字节数组（取前 16 字节）
  var valid21 = unique.filter(function(c) { return c.rl === 21; });
  console.log('\n  21B 数组:', valid21.length);
  
  for (var ki = 0; ki < valid21.length; ki++) {
    var key21 = valid21[ki].d.slice(0, 16);
    
    for (var flag = 0; flag <= 1; flag++) {
      try {
        var sDec = encryptMode2([...sessionData], key21, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
          if (ascii > 0.6) {
            console.log('  ★★★ 21B[' + ki + '] session f=' + flag + ': ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
            console.log('    key:', key21.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('    str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 48));
            found = true;
          }
        }
      } catch(e) {}
    }
  }
  
  // 测试所有捕获的数组（任何大小 16-48）的前 16 字节
  console.log('\n  测试所有数组的前 16 字节...');
  for (var ki = 0; ki < unique.length; ki++) {
    if (unique[ki].rl < 16) continue;
    var keyAny = unique[ki].d.slice(0, 16);
    
    try {
      var sDec = encryptMode2([...sessionData], keyAny, 0);
      if (sDec && sDec.length > 0) {
        var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
        if (ascii > 0.7) {
          console.log('  ★★★ Arr[' + ki + '] (len=' + unique[ki].rl + ', type=' + unique[ki].t + ') session: ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
          console.log('    key:', keyAny.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
          console.log('    str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 48));
          found = true;
        }
      }
    } catch(e) {}
  }
  
  // 测试 4 字节数组组合（4 个 uint32 → 16 字节 key）
  console.log('\n  测试 4 字节数组组合...');
  var valid4 = unique.filter(function(c) { return c.rl === 4; });
  console.log('  4B 数组:', valid4.length);
  
  // 尝试将 4 字节数组扩展为 16 字节
  for (var ki = 0; ki < valid4.length; ki++) {
    var d = valid4[ki].d;
    // 方式1：直接重复 4 次
    var keyRep = [...d, ...d, ...d, ...d];
    // 方式2：作为 uint32 展开
    var keyU32 = [];
    for (var bi = 0; bi < 4; bi++) {
      keyU32.push((d[0] >> (bi * 8)) & 0xFF);
      keyU32.push((d[1] >> (bi * 8)) & 0xFF);
      keyU32.push((d[2] >> (bi * 8)) & 0xFF);
      keyU32.push((d[3] >> (bi * 8)) & 0xFF);
    }
    
    [keyRep, keyU32].forEach(function(key, mode) {
      try {
        var sDec = encryptMode2([...sessionData], key, 0);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
          if (ascii > 0.7) {
            console.log('  ★★★ 4B[' + ki + '] mode=' + mode + ': ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
            found = true;
          }
        }
      } catch(e) {}
    });
  }
  
  if (!found) {
    console.log('\n  ✗ 未找到正确密钥');
    console.log('  密钥可能不在任何经过数组操作的中间值中');
    console.log('  密钥可能是直接从闭包变量读取的（不经过数组转换）');
  }
  
  // 保存所有捕获
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/key-hunt-results.json'),
    JSON.stringify({ query: queryValue, unique: unique.map(function(c) { return { rl: c.rl, t: c.t, d: c.d }; }) }, null, 2)
  );
  
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
