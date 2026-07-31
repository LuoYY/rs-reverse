/**
 * query_key_extract2.js — 更全面的轮密钥捕获
 *
 * 44 元素数组没有被 slice/concat 捕获
 * 说明轮密钥不是通过 slice/concat 创建的
 * 它可能是通过 push 逐元素构建的
 * 或者直接通过 new Array(44) 创建
 * 
 * 新方法：
 * 1. hook push 到长度恰好为 44 的数组
 * 2. hook 所有长度为 4 的 uint32 数组（AES 密钥单元）
 * 3. hook new Array 构造
 * 4. 或者：直接在浏览器中读取 VM scope 变量
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
  console.log('=== 全面轮密钥捕获 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, userAgent: UA,
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
      
      function isNumArr(arr, minLen, maxLen) {
        if (!arr || arr.length < minLen || arr.length > maxLen) return false;
        for (var i = 0; i < Math.min(5, arr.length); i++) {
          if (typeof arr[i] !== 'number' || isNaN(arr[i])) return false;
        }
        return true;
      }
      
      // Hook slice — 捕获所有 4-128 长度的数字数组
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        var result = origSlice.apply(this, arguments);
        if (!__inHook && isNumArr(result, 4, 128)) {
          __inHook = true;
          try {
            window.__caps.push({ t: 'slice', rl: result.length, d: origSlice.call(result, 0, 128), fl: this.length });
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      // Hook concat
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        var result = origConcat.apply(this, arguments);
        if (!__inHook && isNumArr(result, 4, 128)) {
          __inHook = true;
          try {
            window.__caps.push({ t: 'concat', rl: result.length, d: origSlice.call(result, 0, 128) });
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      // Hook Array.from
      var origFrom = Array.from;
      Array.from = function() {
        var result = origFrom.apply(this, arguments);
        if (!__inHook && isNumArr(result, 4, 128)) {
          __inHook = true;
          try {
            window.__caps.push({ t: 'from', rl: result.length, d: origSlice.call(result, 0, 128) });
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      // Hook map — 捕获 this 和 result
      var origMap = Array.prototype.map;
      Array.prototype.map = function() {
        var result = origMap.apply(this, arguments);
        if (!__inHook) {
          __inHook = true;
          try {
            if (isNumArr(this, 4, 128)) {
              window.__caps.push({ t: 'map_this', rl: this.length, d: origSlice.call(this, 0, 128) });
            }
            if (isNumArr(result, 4, 128)) {
              window.__caps.push({ t: 'map_result', rl: result.length, d: origSlice.call(result, 0, 128) });
            }
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

  if (!queryValue) {
    var urlResult = await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); var m = (x.responseURL||'').match(/r20SZOQm=([^&]+)/); return m ? m[1] : ''; } catch(e) { return ''; } })()`,
      returnByValue: true,
    });
    queryValue = urlResult.result.value;
  }
  console.log('  Query:', queryValue ? queryValue.substring(0, 50) + '...' : 'NONE');

  // 获取所有捕获
  var caps = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__caps || [])',
    returnByValue: true,
  });
  var capsData = JSON.parse(caps.result.value);
  console.log('  总捕获:', capsData.length);
  
  // 按长度分组
  var byLen = {};
  capsData.forEach(function(c) {
    var l = c.rl;
    if (!byLen[l]) byLen[l] = [];
    byLen[l].push(c);
  });
  Object.keys(byLen).sort((a,b) => +a - +b).forEach(function(l) {
    var arrs = byLen[l];
    // 去重
    var seen = new Set();
    var unique = [];
    arrs.forEach(function(c) {
      var key = c.d.join(',');
      if (!seen.has(key)) { seen.add(key); unique.push(c); }
    });
    console.log('  ' + l + 'B: ' + unique.length + ' unique (' + unique[0].t + ')');
  });

  // 提取所有唯一的数组
  var seen2 = new Set();
  var allUnique = [];
  capsData.forEach(function(c) {
    var key = c.d.join(',');
    if (!seen2.has(key)) { seen2.add(key); allUnique.push(c); }
  });

  await browser.close();

  if (!queryValue || queryValue.length < 10) {
    console.log('FATAL: 无 query');
    process.exit(1);
  }

  // 用管线测试所有捕获的数组
  console.log('\n[5] 测试所有 ' + allUnique.length + ' 个唯一数组...');
  
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: UA });
  var m2 = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var cp3 = pipeClient._extractCp3(+m2[1], m2[2]);
  await pipeClient._genCookie({ nsd: +m2[1], cd: m2[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  var found = false;
  var bestAscii = 0;
  
  // 测试每个数组的前 16 字节作为 key
  for (var ki = 0; ki < allUnique.length; ki++) {
    var c = allUnique[ki];
    if (c.rl < 16) continue;
    
    // 取前 16 字节作为 key
    var key = c.d.slice(0, 16).map(function(x) { return x & 0xFF; });
    
    for (var flag = 0; flag <= 1; flag++) {
      try {
        var sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
          if (ascii > bestAscii) bestAscii = ascii;
          if (ascii > 0.6) {
            console.log('  ★★★ Key[' + ki + '] (' + c.t + ', len=' + c.rl + ') session f=' + flag + ': ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
            console.log('    key:', key.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('    str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 48));
            found = true;
          }
        }
      } catch(e) {}
      
      try {
        var rDec = encryptMode2([...requestData], key, flag);
        if (rDec && rDec.length > 0) {
          var ascii = rDec.filter(function(b) { return b >= 32 && b <= 126; }).length / rDec.length;
          if (ascii > bestAscii) bestAscii = ascii;
          if (ascii > 0.6) {
            console.log('  ★★★ Key[' + ki + '] (' + c.t + ', len=' + c.rl + ') request f=' + flag + ': ' + (ascii*100).toFixed(0) + '% ASCII ★★★');
            console.log('    key:', key.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            console.log('    str:', Buffer.from(rDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 32));
            found = true;
          }
        }
      } catch(e) {}
    }
    
    // 也尝试将数组作为 uint32 → bytes
    if (c.rl >= 4 && c.rl <= 16) {
      var keyU32 = [];
      for (var bi = 0; bi < Math.min(c.rl, 4); bi++) {
        var v = c.d[bi] >>> 0;
        keyU32.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF);
      }
      while (keyU32.length < 16) keyU32.push(0);
      
      try {
        var sDec2 = encryptMode2([...sessionData], keyU32.slice(0, 16), 0);
        if (sDec2 && sDec2.length > 0) {
          var ascii2 = sDec2.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec2.length;
          if (ascii2 > bestAscii) bestAscii = ascii2;
          if (ascii2 > 0.6) {
            console.log('  ★★★ u32Key[' + ki + '] (' + c.t + ', len=' + c.rl + ') session: ' + (ascii2*100).toFixed(0) + '% ASCII ★★★');
            console.log('    key:', keyU32.slice(0,16).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
            found = true;
          }
        }
      } catch(e) {}
    }
  }
  
  console.log('\n  最佳 ASCII:', (bestAscii * 100).toFixed(1) + '%');
  console.log('  找到密钥:', found ? 'YES ★' : 'NO');
  
  if (!found) {
    console.log('\n  密钥不在任何经过数组操作的中间值中');
    console.log('  密钥可能直接从 VM scope 变量读取');
    console.log('  → 需要方案2：完全模拟 VM 子程序 109');
  }
  
  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/key-extract-v2.json'),
    JSON.stringify({ query: queryValue, captures: allUnique.slice(0, 100) }, null, 2)
  );

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
