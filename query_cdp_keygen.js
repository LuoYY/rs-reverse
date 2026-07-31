/**
 * query_cdp_keygen.js — 在浏览器中实时提取 query 加密的密钥
 *
 * 新策略：不再猜测密钥，而是在浏览器中直接拦截加密过程
 *
 * 方法：
 * 1. 在 RS 动态代码执行前，hook 关键加密函数
 * 2. 当 RS 生成 query 时，hook 会捕获加密前后的数据
 * 3. 具体方法：hook Array.prototype.slice（AES 操作常用）
 *    或者 hook Uint8Array 构造器
 *
 * 关键改进：
 * - 使用 context.addInitScript 在 RS 代码执行前注入 hook
 * - 用条件过滤（只捕获 16/32/48 字节数组）
 * - 用 window 全局变量传递捕获的数据
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 浏览器实时密钥提取 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  // ★ 关键：在 RS 代码执行前注入 hook
  await context.addInitScript(function() {
    // 存储捕获的数据
    window.__crypto_captures = [];
    
    // Hook 1: Array.prototype.slice — AES 操作常用 slice 来提取子数组
    var origSlice = Array.prototype.slice;
    var sliceCount = 0;
    Array.prototype.slice = function(start, end) {
      var result = origSlice.apply(this, arguments);
      // 只捕获 16/32/48 字节的纯数字数组
      if (result.length >= 16 && result.length <= 48) {
        var allNum = true;
        for (var i = 0; i < Math.min(5, result.length); i++) {
          if (typeof result[i] !== 'number') { allNum = false; break; }
        }
        if (allNum) {
          sliceCount++;
          if (sliceCount <= 200) { // 限制捕获数量
            window.__crypto_captures.push({
              type: 'slice',
              fromLen: this.length,
              resultLen: result.length,
              start: start,
              end: end,
              data: Array.from(result).slice(0, 48),
              sourceLen: this.length,
            });
          }
        }
      }
      return result;
    };
    
    // Hook 2: String.prototype.charCodeAt — 加密常从字符串提取字节
    // 太频繁，跳过
    
    // Hook 3: Array.prototype.push — RS 可能用 push 构建加密数组
    var origPush = Array.prototype.push;
    var pushCaptures = [];
    var origPushFn = origPush;
    // push 太频繁，需要更精确的条件
    // 改为 hook concat
    
    // Hook 4: Array.prototype.concat — RS 可能用 concat 拼接加密块
    var origConcat = Array.prototype.concat;
    Array.prototype.concat = function() {
      var result = origConcat.apply(this, arguments);
      if (result.length === 88 || result.length === 48 || result.length === 32) {
        var allNum = true;
        for (var i = 0; i < Math.min(5, result.length); i++) {
          if (typeof result[i] !== 'number') { allNum = false; break; }
        }
        if (allNum) {
          window.__crypto_captures.push({
            type: 'concat',
            resultLen: result.length,
            data: Array.from(result).slice(0, 88),
            args: Array.from(arguments).map(function(a) { return a.length; }),
          });
        }
      }
      return result;
    };
    
    // Hook 5: 监控 88 字节数组的创建
    // RS 最终会创建一个 88 字节数组用于编码 query
    // 这个数组在 numarrJoin 之后、numarr2string 之前
    var origJoin = Array.prototype.join;
    Array.prototype.join = function(sep) {
      if (this.length === 88) {
        var allNum = true;
        for (var i = 0; i < 5; i++) {
          if (typeof this[i] !== 'number') { allNum = false; break; }
        }
        if (allNum) {
          window.__crypto_captures.push({
            type: 'join88',
            data: Array.from(this),
            sep: String(sep).substring(0, 5),
          });
        }
      }
      return origJoin.apply(this, arguments);
    };
    
    console.log('[Hook] Crypto interceptors installed');
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
        path: (params.request.url.match(/([^?]+)/) || [])[1] || '',
        query: qMatch ? qMatch[1] : '',
        method: params.request.method,
      });
    }
  });

  // 首次加载 + reload
  console.log('[1] 首次加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  
  // 检查 hook 是否安装
  var hookCheck = await client.send('Runtime.evaluate', {
    expression: 'typeof window.__crypto_captures',
    returnByValue: true,
  });
  console.log('  Hook installed:', hookCheck.result.value !== 'undefined');
  
  // 清空初始化期间的捕获
  await client.send('Runtime.evaluate', {
    expression: 'window.__crypto_captures = []',
  });
  
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 清空 reload 期间的捕获（cookie 生成过程）
  var initCaptures = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__crypto_captures || [])',
    returnByValue: true,
  });
  var initData = JSON.parse(initCaptures.result.value);
  console.log('  Init captures:', initData.length);
  
  // 清空，只捕获 query 生成的数据
  await client.send('Runtime.evaluate', {
    expression: 'window.__crypto_captures = []',
  });

  // 触发 POST 请求
  console.log('\n[3] 触发 POST 请求...');
  var triggerResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send('{}');
        return JSON.stringify({status: xhr.status, responseURL: xhr.responseURL});
      } catch(e) { return JSON.stringify({error: e.message}); }
    })()`,
    returnByValue: true,
  });
  console.log('  Trigger:', triggerResult.result.value);

  await page.waitForTimeout(1000);

  // 获取捕获的数据
  var captured = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__crypto_captures || [])',
    returnByValue: true,
  });

  var capturedData = JSON.parse(captured.result.value);
  console.log('\n[4] 捕获的加密操作:', capturedData.length);

  // 分类统计
  var byType = {};
  capturedData.forEach(function(c) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  });
  console.log('  按类型:', JSON.stringify(byType));

  // 显示 88 字节数组（query 编码前的数据）
  var join88 = capturedData.filter(function(c) { return c.type === 'join88'; });
  console.log('\n  88 字节数组 (join88):', join88.length);
  join88.forEach(function(c, i) {
    console.log('\n  [' + i + '] 88 bytes:');
    console.log('    hex:', c.data.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    // 拆分结构
    console.log('    nonce[0:4]:', c.data.slice(0, 4).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    console.log('    header[4:7]:', c.data.slice(4, 7));
    console.log('    session[7:55]:', c.data.slice(7, 55).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    console.log('    len[55]:', c.data[55]);
    console.log('    request[56:88]:', c.data.slice(56, 88).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });

  // 显示 48 字节的 concat（可能是 session_data）
  var concat48 = capturedData.filter(function(c) { return c.type === 'concat' && c.resultLen === 48; });
  console.log('\n  48 字节 concat:', concat48.length);
  concat48.slice(0, 3).forEach(function(c, i) {
    console.log('  [' + i + ']:', c.data.slice(0, 20).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '), '...');
  });

  // 显示 32 字节的 concat（可能是 request_data）
  var concat32 = capturedData.filter(function(c) { return c.type === 'concat' && c.resultLen === 32; });
  console.log('\n  32 字节 concat:', concat32.length);
  concat32.slice(0, 3).forEach(function(c, i) {
    console.log('  [' + i + ']:', c.data.slice(0, 20).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '), '...');
  });

  // 显示 16 字节的 slice（可能是 AES key）
  var slice16 = capturedData.filter(function(c) { return c.type === 'slice' && c.resultLen === 16; });
  console.log('\n  16 字节 slice:', slice16.length);
  
  // 去重
  var seen16 = new Set();
  var unique16 = [];
  slice16.forEach(function(c) {
    var key = c.data.join(',');
    if (!seen16.has(key)) {
      seen16.add(key);
      unique16.push(c);
    }
  });
  console.log('  唯一 16 字节数组:', unique16.length);
  
  unique16.slice(0, 20).forEach(function(c, i) {
    console.log('  [' + i + '] from len=' + c.fromLen + ':', c.data.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });

  // 对比 query 中的 session_data 和 request_data
  if (join88.length > 0) {
    var q88 = join88[0].data;
    var sessionData = q88.slice(7, 55);
    var requestData = q88.slice(56, 88);
    
    console.log('\n=== 对比 session_data 与 16B slice ===');
    unique16.forEach(function(c, i) {
      // 检查这个 16B 是否出现在 session_data 中
      var found = false;
      for (var j = 0; j <= sessionData.length - 16; j++) {
        var match = true;
        for (var k = 0; k < 16; k++) {
          if ((sessionData[j + k] & 0xFF) !== (c.data[k] & 0xFF)) { match = false; break; }
        }
        if (match) { found = true; break; }
      }
      if (found) {
        console.log('  ★ slice[' + i + '] 出现在 session_data 中！');
      }
    });
    
    console.log('\n=== 对比 request_data 与 16B slice ===');
    unique16.forEach(function(c, i) {
      var found = false;
      for (var j = 0; j <= requestData.length - 16; j++) {
        var match = true;
        for (var k = 0; k < 16; k++) {
          if ((requestData[j + k] & 0xFF) !== (c.data[k] & 0xFF)) { match = false; break; }
        }
        if (match) { found = true; break; }
      }
      if (found) {
        console.log('  ★ slice[' + i + '] 出现在 request_data 中！');
      }
    });
  }

  // 保存所有捕获
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/crypto-captures.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      queryRequests: queryRequests,
      captures: capturedData.slice(0, 500), // 限制保存数量
      initCaptures: initData.slice(0, 100),
    }, null, 2)
  );
  console.log('\nSaved to output/capture-20080/crypto-captures.json');

  console.log('\n=== 总结 ===');
  console.log('Query requests:', queryRequests.length);
  console.log('88B arrays (join88):', join88.length);
  console.log('Unique 16B arrays:', unique16.length);
  if (join88.length > 0) {
    console.log('★ 成功捕获 query 编码前的 88 字节数组！');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
