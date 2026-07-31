/**
 * query_cdp_keygen3.js — 修复 push hook 的递归问题
 *
 * 问题：push hook 内部调用 this.length 触发了 getter，
 * 而 getter 可能又调用了 push → 无限递归
 *
 * 修复：
 * 1. 移除 push hook（太容易递归）
 * 2. 只用 slice/concat/from hook
 * 3. 在 hook 内部添加递归保护
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 浏览器密钥提取 v3（修复递归）===\n');

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

  // 注入 hook（无 push，有递归保护）
  console.log('\n[3] 注入 hook...');
  var hookResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      window.__caps = [];
      var __inHook = false; // 递归保护
      
      // Hook Array.from
      var origFrom = Array.from;
      Array.from = function() {
        var result = origFrom.apply(this, arguments);
        if (!__inHook && result.length >= 16 && result.length <= 128) {
          __inHook = true;
          try {
            var allNum = true;
            for (var i = 0; i < Math.min(5, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
            }
            if (allNum) {
              window.__caps.push({ t: 'from', rl: result.length, d: result.slice(0, 128).map(function(x){return x&0xFF;}) });
            }
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      // Hook Array.prototype.slice
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        var result = origSlice.apply(this, arguments);
        if (!__inHook && result.length >= 16 && result.length <= 128) {
          __inHook = true;
          try {
            var allNum = true;
            for (var i = 0; i < Math.min(5, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
            }
            if (allNum) {
              window.__caps.push({ t: 'slice', fl: this.length, rl: result.length, d: result.slice(0, 128).map(function(x){return x&0xFF;}) });
            }
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      // Hook Array.prototype.concat
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        var result = origConcat.apply(this, arguments);
        if (!__inHook && result.length >= 16 && result.length <= 128) {
          __inHook = true;
          try {
            var allNum = true;
            for (var i = 0; i < Math.min(5, result.length); i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
            }
            if (allNum) {
              window.__caps.push({ t: 'concat', rl: result.length, d: result.slice(0, 128).map(function(x){return x&0xFF;}) });
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
  console.log('  Hook:', hookResult.result.value);

  // 触发 POST
  console.log('\n[4] 触发 POST...');
  var trigger = await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.setRequestHeader('Content-Type','application/json'); x.send('{}'); return JSON.stringify({s:x.status, q:x.responseURL.indexOf('r20SZOQm=')>=0}); } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });
  console.log('  Result:', trigger.result.value);

  await page.waitForTimeout(500);

  // 获取捕获
  var caps = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__caps || [])',
    returnByValue: true,
  });
  var capsData = JSON.parse(caps.result.value);
  console.log('\n[5] 捕获:', capsData.length);

  // 分类
  var byType = {};
  capsData.forEach(function(c) { byType[c.t] = (byType[c.t] || 0) + 1; });
  console.log('  类型:', JSON.stringify(byType));

  // 88 字节
  var arr88 = capsData.filter(function(c) { return c.rl === 88; });
  console.log('\n  88 字节:', arr88.length);
  arr88.forEach(function(c, i) {
    console.log('  [' + i + '] type=' + c.t + ':');
    console.log('    hex:', c.d.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  });

  // 48 字节
  var arr48 = capsData.filter(function(c) { return c.rl === 48; });
  console.log('\n  48 字节:', arr48.length);
  arr48.slice(0, 5).forEach(function(c, i) {
    console.log('  [' + i + ']:', c.d.slice(0,24).map(function(b){return (b&0xFF).toString(16).padStart(2,'0');}).join(' '), '...');
  });

  // 32 字节
  var arr32 = capsData.filter(function(c) { return c.rl === 32; });
  console.log('\n  32 字节:', arr32.length);
  arr32.slice(0, 5).forEach(function(c, i) {
    console.log('  [' + i + ']:', c.d.slice(0,20).map(function(b){return (b&0xFF).toString(16).padStart(2,'0');}).join(' '), '...');
  });

  // 16 字节（密钥候选）
  var arr16 = capsData.filter(function(c) { return c.rl === 16; });
  var seen = new Set();
  var unique16 = [];
  arr16.forEach(function(c) {
    var key = c.d.join(',');
    if (!seen.has(key)) { seen.add(key); unique16.push(c); }
  });
  console.log('\n  16 字节 (唯一):', unique16.length);
  unique16.slice(0, 20).forEach(function(c, i) {
    console.log('  [' + i + '] ' + c.t + ':', c.d.map(function(b){return (b&0xFF).toString(16).padStart(2,'0');}).join(' '));
  });

  // 对比 88 字节与 query
  if (arr88.length > 0 && queryRequests.length > 0) {
    console.log('\n=== 对比 88 字节与 query ===');
    var q88 = arr88[arr88.length - 1].d; // 最后一个
    var query = queryRequests[queryRequests.length - 1].query;
    
    var basestr = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
    var payload = query.startsWith('0') ? query.slice(1) : query;
    var idxmap = {};
    for (var i = 0; i < basestr.length; i++) { if (!(basestr[i] in idxmap)) idxmap[basestr[i]] = i; }
    var qBytes = [];
    var qi2 = 0;
    var full = Math.floor(payload.length / 4);
    for (var g = 0; g < full; g++) {
      var c0 = idxmap[payload[qi2]], c1 = idxmap[payload[qi2+1]], c2 = idxmap[payload[qi2+2]], c3 = idxmap[payload[qi2+3]];
      qi2 += 4;
      qBytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
    }
    
    var match = true;
    for (var i = 0; i < 88 && i < qBytes.length; i++) {
      if ((q88[i] & 0xFF) !== (qBytes[i] & 0xFF)) { match = false; break; }
    }
    console.log('  Match:', match ? '★ YES' : 'NO');
    
    if (match) {
      console.log('\n  *** 成功捕获 query 编码前的 88 字节！ ***');
      console.log('  session_data:', q88.slice(7, 55).map(function(b){return (b&0xFF).toString(16).padStart(2,'0');}).join(' '));
      console.log('  request_data:', q88.slice(56, 88).map(function(b){return (b&0xFF).toString(16).padStart(2,'0');}).join(' '));
      
      // 现在可以用 16 字节候选作为 key 尝试 AES-CBC 解密
      console.log('\n  === 用捕获的 16B key 尝试 AES-CBC 解密 ===');
      var crypto = require('crypto');
      var sessionData = q88.slice(7, 55);
      var requestData = q88.slice(56, 88);
      
      unique16.forEach(function(kc, ki) {
        var key = Buffer.from(kc.d);
        var iv = Buffer.alloc(16, 0);
        try {
          var dec = crypto.createDecipheriv('aes-128-cbc', key, iv);
          dec.setAutoPadding(false);
          var result = Buffer.concat([dec.update(Buffer.from(sessionData)), dec.final()]);
          var ascii = [...result].filter(b => b >= 32 && b <= 126).length / result.length;
          if (ascii > 0.6) {
            console.log('  ★ Key[' + ki + '] session: ' + (ascii*100).toFixed(0) + '% ASCII');
            console.log('    "' + result.toString('utf8').substring(0,48) + '"');
          }
        } catch(e) {}
        try {
          var dec2 = crypto.createDecipheriv('aes-128-cbc', key, iv);
          dec2.setAutoPadding(false);
          var result2 = Buffer.concat([dec2.update(Buffer.from(requestData)), dec2.final()]);
          var ascii2 = [...result2].filter(b => b >= 32 && b <= 126).length / result2.length;
          if (ascii2 > 0.6) {
            console.log('  ★ Key[' + ki + '] request: ' + (ascii2*100).toFixed(0) + '% ASCII');
            console.log('    "' + result2.toString('utf8').substring(0,32) + '"');
          }
        } catch(e) {}
      });
    }
  }

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/keygen-v3-captures.json'),
    JSON.stringify({ caps: capsData.slice(0, 500), queries: queryRequests.slice(-3) }, null, 2)
  );

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
