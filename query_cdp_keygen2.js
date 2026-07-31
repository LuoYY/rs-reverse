/**
 * query_cdp_keygen2.js — 改进 hook 策略
 *
 * 问题：addInitScript 的 hook 在 reload 后丢失
 * RS 在 reload 后重新执行，但 hook 已经被页面覆盖
 *
 * 解决方案：
 * 1. 不用 addInitScript（在 reload 后丢失）
 * 2. 在 reload 完成后用 CDP Runtime.evaluate 注入 hook
 * 3. 然后触发请求
 * 4. hook 在 RS 代码执行后安装，但 query 生成在 send 时发生
 *    所以 hook 能捕获 send 时的加密操作
 *
 * 关键改进：
 * - hook 在 reload 后注入（RS 已完成初始化）
 * - hook Array.prototype.slice/concat/join + push
 * - 用更宽松的条件（捕获所有 10-100 字节的纯数字数组）
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 浏览器密钥提取 v2 ===\n');

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

  // 监听网络请求
  var queryRequests = [];
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0) {
      var qMatch = params.request.url.match(/r20SZOQm=([^&]+)/);
      queryRequests.push({
        query: qMatch ? qMatch[1] : '',
        method: params.request.method,
        path: params.request.url.split('?')[0],
      });
    }
  });

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // ★ 关键：在 reload 后注入 hook
  console.log('\n[3] 注入加密拦截 hook...');

  var hookCode = `
    (function() {
      window.__caps = [];
      
      // Hook Array.prototype.slice
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function(start, end) {
        var result = origSlice.apply(this, arguments);
        if (result.length >= 8 && result.length <= 128) {
          var allNum = true;
          for (var i = 0; i < Math.min(5, result.length); i++) {
            if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
          }
          if (allNum) {
            window.__caps.push({
              t: 'slice',
              fl: this.length,
              rl: result.length,
              d: Array.from(result).slice(0, 128).map(function(x) { return x & 0xFF; }),
            });
          }
        }
        return result;
      };
      
      // Hook Array.prototype.concat
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        var result = origConcat.apply(this, arguments);
        if (result.length >= 16 && result.length <= 128) {
          var allNum = true;
          for (var i = 0; i < Math.min(5, result.length); i++) {
            if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
          }
          if (allNum) {
            window.__caps.push({
              t: 'concat',
              rl: result.length,
              d: Array.from(result).slice(0, 128).map(function(x) { return x & 0xFF; }),
            });
          }
        }
        return result;
      };
      
      // Hook String.fromCharCode（numarr2string 的核心）
      var origFCC = String.fromCharCode;
      var fccCalls = [];
      String.fromCharCode = function() {
        if (arguments.length === 1 && typeof arguments[0] === 'number') {
          // 单字符调用，跳过
        } else if (arguments.length >= 10) {
          fccCalls.push(Array.from(arguments).slice(0, 128));
          if (fccCalls.length <= 50) {
            window.__caps.push({
              t: 'fcc',
              rl: arguments.length,
              d: Array.from(arguments).slice(0, 128).map(function(x) { return x & 0xFF; }),
            });
          }
        }
        return origFCC.apply(String, arguments);
      };
      
      // Hook charCodeAt（加密常从字符串提取字节）
      // 太频繁，跳过
      
      // 关键：hook push 到特定长度的数组
      // RS 可能用 push 逐字节构建加密数组
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        var result = origPush.apply(this, arguments);
        // 只在数组长度达到关键值时捕获
        if (this.length === 88 || this.length === 48 || this.length === 32 || this.length === 16) {
          var allNum = true;
          for (var i = 0; i < Math.min(5, this.length); i++) {
            if (typeof this[i] !== 'number' || isNaN(this[i])) { allNum = false; break; }
          }
          if (allNum) {
            window.__caps.push({
              t: 'push_' + this.length,
              rl: this.length,
              d: Array.from(this).slice(0, 128).map(function(x) { return x & 0xFF; }),
            });
          }
        }
        return result;
      };
      
      return 'hooks installed';
    })()
  `;

  var hookResult = await client.send('Runtime.evaluate', {
    expression: hookCode,
    returnByValue: true,
  });
  console.log('  Hook:', hookResult.result.value);

  // 触发 POST 请求
  console.log('\n[4] 触发 POST 请求...');
  var trigger = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send('{}');
        return JSON.stringify({status: xhr.status, hasQuery: xhr.responseURL.indexOf('r20SZOQm=') >= 0});
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  console.log('  Trigger:', trigger.result.value);

  await page.waitForTimeout(500);

  // 获取捕获的数据
  var caps = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__caps || [])',
    returnByValue: true,
  });

  var capsData = JSON.parse(caps.result.value);
  console.log('\n[5] 捕获:', capsData.length);

  // 分类统计
  var byType = {};
  capsData.forEach(function(c) {
    byType[c.t] = (byType[c.t] || 0) + 1;
  });
  console.log('  类型:', JSON.stringify(byType));

  // 显示 88 字节数组
  var arr88 = capsData.filter(function(c) { return c.rl === 88; });
  console.log('\n  88 字节数组:', arr88.length);
  arr88.forEach(function(c, i) {
    console.log('\n  [' + i + '] type=' + c.t + ':');
    console.log('    hex:', c.d.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });

  // 显示 48 字节数组
  var arr48 = capsData.filter(function(c) { return c.rl === 48; });
  console.log('\n  48 字节数组:', arr48.length);
  arr48.slice(0, 5).forEach(function(c, i) {
    console.log('  [' + i + '] type=' + c.t + ':', c.d.slice(0, 24).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '), '...');
  });

  // 显示 32 字节数组
  var arr32 = capsData.filter(function(c) { return c.rl === 32; });
  console.log('\n  32 字节数组:', arr32.length);
  arr32.slice(0, 5).forEach(function(c, i) {
    console.log('  [' + i + '] type=' + c.t + ':', c.d.slice(0, 20).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '), '...');
  });

  // 显示 16 字节数组（密钥候选）
  var arr16 = capsData.filter(function(c) { return c.rl === 16; });
  console.log('\n  16 字节数组:', arr16.length);
  
  // 去重
  var seen = new Set();
  var unique16 = [];
  arr16.forEach(function(c) {
    var key = c.d.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      unique16.push(c);
    }
  });
  console.log('  唯一 16 字节:', unique16.length);
  unique16.slice(0, 30).forEach(function(c, i) {
    console.log('  [' + i + '] type=' + c.t + ':', c.d.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });

  // 如果有 88 字节数组，与 query 对比
  if (arr88.length > 0 && queryRequests.length > 0) {
    console.log('\n=== 对比 88 字节与 query ===');
    var q88 = arr88[0].d;
    var query = queryRequests[queryRequests.length - 1].query; // 最后一个（刚触发的）
    
    // 用 basestr 解码 query
    var basestr = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
    var payload = query.startsWith('0') ? query.slice(1) : query;
    var idxmap = {};
    for (var i = 0; i < basestr.length; i++) { if (!(basestr[i] in idxmap)) idxmap[basestr[i]] = i; }
    var qBytes = [];
    var qi = 0;
    var full = Math.floor(payload.length / 4);
    for (var g = 0; g < full; g++) {
      var c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi+1]], c2 = idxmap[payload[qi+2]], c3 = idxmap[payload[qi+3]];
      qi += 4;
      qBytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    
    console.log('  88B from hook:', q88.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    console.log('  88B from query:', qBytes.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    
    var match = true;
    for (var i = 0; i < 88; i++) {
      if ((q88[i] & 0xFF) !== (qBytes[i] & 0xFF)) { match = false; break; }
    }
    console.log('  Match:', match ? 'YES ★' : 'NO');
    
    if (match) {
      console.log('\n  *** 成功捕获 query 编码前的 88 字节数组！ ***');
      console.log('  这意味着我们可以在加密前拦截所有中间值');
    }
  }

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/keygen-captures.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      queries: queryRequests.slice(-3),
      captures: capsData.slice(0, 500),
    }, null, 2)
  );

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
