/**
 * query_cdp_live_decrypt.js — 在浏览器中实时拦截 query 解密
 *
 * 核心思路变化：
 * 不再猜测加密算法和密钥，而是直接在浏览器中：
 * 1. 用 CDP Debugger 在 RS send hook 执行时暂停
 * 2. 在暂停时 dump VM scope 中的所有变量
 * 3. 找到 query 生成前后的中间值
 *
 * 或者更简单：
 * 1. 在浏览器中 hook String.prototype.split 或 Array.prototype.join
 * 2. 当检测到 88 字节数组被 join 时，dump 调用栈和变量
 * 3. 这样可以直接捕获 query 的明文和密文
 *
 * 最简单方案：
 * 1. 在浏览器中 hook numarr2string（通过特征匹配）
 * 2. 当 88 字节数组被编码时，dump 它
 * 3. 同时 dump 此刻的 VM scope 变量
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 浏览器实时拦截 query 生成 ===\n');

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
  var capturedQueries = [];
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0) {
      var qMatch = params.request.url.match(/r20SZOQm=([^&]+)/);
      capturedQueries.push({
        url: params.request.url,
        query: qMatch ? qMatch[1] : '',
        method: params.request.method,
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

  // 关键方法：在浏览器中安装数组拦截器
  // RS 在生成 query 时会创建 88 字节数组，然后编码为字符串
  // 我们 hook 数组操作来捕获这个瞬间
  console.log('\n[3] 安装数组拦截器...');

  var interceptCode = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 存储捕获的数据
      window.__captured = [];
      
      // Hook 1: 拦截 Array.prototype.join（numarr2string 可能用 join）
      var origJoin = Array.prototype.join;
      Array.prototype.join = function(sep) {
        // 检查是否是 query 相关的数组
        if (this.length >= 80 && this.length <= 120) {
          var allNum = true;
          for (var i = 0; i < Math.min(10, this.length); i++) {
            if (typeof this[i] !== 'number') { allNum = false; break; }
          }
          if (allNum) {
            // 捕获调用栈
            var stack;
            try { throw new Error('trace'); } catch(e) { stack = e.stack; }
            
            window.__captured.push({
              type: 'join',
              length: this.length,
              data: Array.from(this).slice(0, 100),
              sep: String(sep).substring(0, 20),
              stack: stack.substring(0, 400),
              result: origJoin.call(this, sep).substring(0, 200),
            });
          }
        }
        return origJoin.apply(this, arguments);
      };
      
      // Hook 2: 拦截特定长度的数组创建
      // numarr2string 可能逐字符构建字符串
      // 不容易拦截，改为拦截 charCodeAt + fromCharCode
      
      // Hook 3: 拦截 String.fromCharCode
      var origFromCharCode = String.fromCharCode;
      var fromCharCodeCalls = [];
      String.fromCharCode = function() {
        if (arguments.length >= 80) {
          fromCharCodeCalls.push({
            type: 'fromCharCode',
            length: arguments.length,
            data: Array.from(arguments).slice(0, 100),
          });
        }
        return origCharCode.apply(String, arguments);
      };
      
      // Hook 4: 拦截 push（RS 可能用 push 构建 query 数组）
      // 太频繁，需要条件过滤
      
      return 'interceptors installed';
    })()`,
    returnByValue: true,
  });
  console.log('  Result:', interceptCode.result.value);

  // 触发请求
  console.log('\n[4] 触发请求...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send('{}'); return xhr.status; } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });

  await page.waitForTimeout(1000);

  // 获取捕获的数据
  var captured = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__captured || [])',
    returnByValue: true,
  });

  var capturedData = JSON.parse(captured.result.value);
  console.log('\n[5] 捕获的数组操作:', capturedData.length);
  capturedData.forEach(function(c, i) {
    console.log('\n  [' + i + '] type:', c.type, 'length:', c.length);
    console.log('    data (first 30):', c.data.slice(0, 30));
    console.log('    sep:', c.sep);
    console.log('    result:', c.result ? c.result.substring(0, 100) : 'none');
    console.log('    stack:', c.stack ? c.stack.split('\\n').slice(0, 5).join(' | ') : 'none');
  });

  // 方法 2：直接 hook query 参数拼接
  console.log('\n[6] Hook query 参数拼接...');
  
  // RS 在 send hook 中生成 query 并追加到 URL
  // URL 拼接可能用字符串连接或 URL 构造器
  // 关键：找到 r20SZOQm= 出现的位置
  
  var queryHook = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // Hook 字符串拼接中的 r20SZOQm
      // 方法：hook String.prototype.concat 和 + 操作符不可能
      // 改为：hook URL 构造器
      
      var origURL = window.URL;
      var urlCaptures = [];
      
      // 不能替换 URL 构造器（RS 保存了引用）
      // 改为：在 send 后检查 responseURL
      
      // 更好的方法：hook XMLHttpRequest.prototype.open
      // 在 open 被调用时检查 URL 是否已包含 query
      var origOpen = XMLHttpRequest.prototype.open;
      var openCalls = [];
      
      XMLHttpRequest.prototype.open = function(method, url) {
        var urlStr = String(url);
        if (urlStr.indexOf('r20SZOQm=') >= 0) {
          // query 已在 URL 中！
          // 这说明 query 在 open 调用前就已被追加
          // 但 open 是 RS 的 hook...
          
          // 检查 arguments[1] 是否被修改
          openCalls.push({
            method: method,
            url: urlStr.substring(0, 200),
            hasQuery: urlStr.indexOf('r20SZOQm=') >= 0,
            stack: (function(){ try { throw new Error('t'); } catch(e) { return e.stack; } })().substring(0, 400),
          });
        }
        return origOpen.apply(this, arguments);
      };
      
      window.__getOpenCalls = function() { return JSON.stringify(openCalls); };
      
      return 'query hook installed';
    })()`,
    returnByValue: true,
  });
  console.log('  Hook:', queryHook.result.value);

  // 触发
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/security', false); xhr.send('{}'); return 'ok'; } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(500);

  var openCalls = await client.send('Runtime.evaluate', {
    expression: 'window.__getOpenCalls ? window.__getOpenCalls() : "[]"',
    returnByValue: true,
  });
  var calls = JSON.parse(openCalls.result.value);
  console.log('\n  Open calls with query:', calls.length);
  calls.forEach(function(c, i) {
    console.log('  [' + i + ']', c.method, c.url.substring(0, 100));
    if (c.stack) {
      var frames = c.stack.split('\n').filter(function(l) { return l.trim(); }).slice(0, 5);
      frames.forEach(function(f) { console.log('    ', f.trim()); });
    }
  });

  // 方法 3：关键突破 — 用 CDP Debugger.setBreakpointOnFunctionCall
  console.log('\n[7] 用 Debugger 在 send hook 中设暂停点...');
  
  // 获取 send 函数的 objectId
  var sendEval = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
  });
  
  if (sendEval.result.objectId) {
    try {
      // 尝试在 send 函数调用时暂停
      var bpResult = await client.send('Debugger.setBreakpointOnFunctionCall', {
        objectId: sendEval.result.objectId,
      });
      console.log('  Breakpoint set:', JSON.stringify(bpResult));
      
      // 设置暂停处理
      var pausedData = null;
      client.on('Debugger.paused', async function(params) {
        console.log('\n  ★ Debugger paused!');
        console.log('  Call frames:', params.callFrames.length);
        
        // 获取第一个 call frame 的变量
        if (params.callFrames.length > 0) {
          var frame = params.callFrames[0];
          console.log('  Frame 0:', frame.functionName, 'at', frame.location.scriptId + ':' + frame.location.lineNumber + ':' + frame.location.columnNumber);
          
          // 获取 scope 变量
          try {
            var scopeResult = await client.send('Runtime.evaluateOnCallFrame', {
              callFrameId: frame.callFrameId,
              expression: 'JSON.stringify({args: arguments.length, this_type: typeof this, hasResult: typeof _$ii !== "undefined" ? String(_$ii).substring(0, 200) : "undef"})',
              returnByValue: true,
            });
            console.log('  Frame vars:', scopeResult.result.value);
          } catch(e) {
            console.log('  Eval error:', e.message);
          }
          
          // 尝试获取更多变量
          try {
            var vars = await client.send('Runtime.evaluateOnCallFrame', {
              callFrameId: frame.callFrameId,
              expression: '(function(){ var result = {}; try { result.exitCode = typeof _$$b !== "undefined" ? _$$b : "undef"; } catch(e) {} try { result.retVal = typeof _$ip !== "undefined" ? String(_$ip).substring(0, 200) : "undef"; } catch(e) {} return JSON.stringify(result); })()',
              returnByValue: true,
            });
            console.log('  VM vars:', vars.result.value);
          } catch(e) {}
        }
        
        pausedData = params;
        // 继续执行
        await client.send('Debugger.resume');
      });
      
      // 触发 send
      console.log('  触发 send...');
      await client.send('Runtime.evaluate', {
        expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.send('{}'); return 'done'; } catch(e) { return e.message; } })()`,
        returnByValue: true,
      });
      
      await page.waitForTimeout(2000);
      
      // 移除断点
      if (bpResult.breakpointId) {
        await client.send('Debugger.removeBreakpoint', { breakpointId: bpResult.breakpointId });
      }
      
    } catch(e) {
      console.log('  Breakpoint error:', e.message);
    }
  }

  // 总结
  console.log('\n=== 总结 ===');
  console.log('Captured queries (Network):', capturedQueries.length);
  console.log('Captured array operations:', capturedData.length);
  console.log('Open calls with query:', calls.length);
  
  if (capturedQueries.length > 0) {
    console.log('\n捕获的 query 值:');
    capturedQueries.forEach(function(q, i) {
      console.log('  [' + i + ']', q.method, q.query.substring(0, 60) + '...');
    });
  }

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/live-intercept-results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      queries: capturedQueries,
      arrayOps: capturedData,
      openCalls: calls,
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
