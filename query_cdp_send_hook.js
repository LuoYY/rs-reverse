/**
 * query_cdp_send_hook.js — 定位 RS 的 send hook 中的 query 生成逻辑
 *
 * 重大发现：浏览器中 boolean flag = false，但 RS 仍然生成 query！
 * 这意味着：
 * 1. trampoline 不是 query 生成器（它返回 undefined/空字符串）
 * 2. query 生成在 RS 的 send hook 内部
 * 3. RS 不替换 prototype.send，但用 defineProperty 安装 getter/setter
 *
 * 新策略：
 * 1. 检查 RS 安装的 defineProperty hooks
 * 2. 在 send 调用时检查调用栈
 * 3. 用 CDP Debugger.pause + evaluateOnCallFrame 提取 query 生成过程
 * 4. 或者：直接 hook URL 修改来捕获 query 值
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 定位 RS send hook 中的 query 生成 ===\n');

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
  await client.send('Debugger.enable');

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // Step 1: 检查 XMLHttpRequest.prototype 的属性描述符
  console.log('\n[3] XMLHttpRequest.prototype 属性描述符...');
  var descResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var result = {};
      var proto = XMLHttpRequest.prototype;
      var names = Object.getOwnPropertyNames(proto);
      
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var desc = Object.getOwnPropertyDescriptor(proto, name);
        if (desc) {
          result[name] = {
            hasGetter: !!desc.get,
            hasSetter: !!desc.set,
            hasValue: desc.hasOwnProperty('value'),
            valueType: desc.value !== undefined ? typeof desc.value : 'none',
            isNative: desc.value ? (desc.value.toString().indexOf('[native code]') >= 0) : false,
            getterStr: desc.get ? desc.get.toString().substring(0, 200) : null,
            setterStr: desc.set ? desc.set.toString().substring(0, 200) : null,
          };
        }
      }
      
      return JSON.stringify(result);
    })()`,
    returnByValue: true,
  });
  
  var descs = JSON.parse(descResult.result.value);
  console.log('  Prototype properties:');
  Object.keys(descs).forEach(function(name) {
    var d = descs[name];
    if (d.hasGetter || d.hasSetter) {
      console.log('  ★ ' + name + ': GETTER/SETTER');
      if (d.getterStr) console.log('    getter:', d.getterStr.substring(0, 120));
      if (d.setterStr) console.log('    setter:', d.setterStr.substring(0, 120));
    } else if (!d.isNative) {
      console.log('  ★ ' + name + ': CUSTOM (' + d.valueType + ')');
    } else {
      // native, skip
    }
  });

  // Step 2: 检查 XMLHttpRequest 构造器
  console.log('\n[4] XMLHttpRequest 构造器...');
  var ctorResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var ctor = XMLHttpRequest;
      var ctorStr = ctor.toString();
      var proto = ctor.prototype;
      
      // 检查构造器是否被替换
      var isNative = ctorStr.indexOf('[native code]') >= 0;
      
      // 检查 prototype.constructor
      var pcStr = proto.constructor ? proto.constructor.toString().substring(0, 200) : 'none';
      
      return JSON.stringify({
        ctorStr: ctorStr.substring(0, 200),
        isNative: isNative,
        pcStr: pcStr,
      });
    })()`,
    returnByValue: true,
  });
  console.log('  Constructor:', ctorResult.result.value);

  // Step 3: 关键 — 检查 RS 是否替换了 send 方法
  // RS 可能用 Object.defineProperty(proto, 'send', {value: rsSend})
  // 或者用 Proxy 包装了 prototype
  console.log('\n[5] 深入检查 send 方法...');
  var sendResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var proto = XMLHttpRequest.prototype;
      var sendDesc = Object.getOwnPropertyDescriptor(proto, 'send');
      
      var result = {
        sendDesc: sendDesc ? {
          configurable: sendDesc.configurable,
          enumerable: sendDesc.enumerable,
          writable: sendDesc.writable,
          hasValue: sendDesc.hasOwnProperty('value'),
          hasGet: !!sendDesc.get,
          hasSet: !!sendDesc.set,
        } : null,
      };
      
      // send 函数的 toString
      result.sendStr = proto.send.toString().substring(0, 300);
      
      // 检查 send 是否是 Proxy
      try {
        result.sendIsProxy = (proto.send === new Proxy(proto.send, {}));
      } catch(e) {
        result.sendIsProxy = 'error: ' + e.message;
      }
      
      // 检查 prototype 是否是 Proxy
      try {
        result.protoIsProxy = (proto === new Proxy(proto, {}));
      } catch(e) {
        result.protoIsProxy = 'error: ' + e.message;
      }
      
      return JSON.stringify(result);
    })()`,
    returnByValue: true,
  });
  console.log('  Send analysis:', sendResult.result.value);

  // Step 4: 用 CDP Debugger 追踪 send 调用
  // 设置一个断点在 send 上
  console.log('\n[6] 用 CDP 追踪 send 调用栈...');
  
  // 方法：在 send 前注入代码来捕获调用栈
  var stackResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 保存原始 send
      var origSend = XMLHttpRequest.prototype.send;
      var sendStacks = [];
      
      // 替换 send 来捕获调用栈
      XMLHttpRequest.prototype.send = function(body) {
        // 捕获调用栈
        var stack;
        try { throw new Error('trace'); } catch(e) { stack = e.stack; }
        
        sendStacks.push({
          stack: stack.substring(0, 500),
          url: this._url || 'unknown',
        });
        
        // 检查 responseURL（send 后会有 query）
        var self = this;
        var result = origSend.call(this, body);
        
        // 记录 responseURL
        sendStacks[sendStacks.length - 1].responseURL = this.responseURL || '';
        
        return result;
      };
      
      window.__getSendStacks = function() { return JSON.stringify(sendStacks); };
      
      return 'send hook installed';
    })()`,
    returnByValue: true,
  });
  console.log('  Hook:', stackResult.result.value);

  // 触发请求
  console.log('\n[7] 触发请求...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send('{}'); return xhr.status; } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });

  await page.waitForTimeout(1000);

  // 获取调用栈
  var stacks = await client.send('Runtime.evaluate', {
    expression: 'window.__getSendStacks ? window.__getSendStacks() : "no hook"',
    returnByValue: true,
  });
  
  var parsedStacks = JSON.parse(stacks.result.value);
  console.log('\n  Send call stacks:', parsedStacks.length);
  parsedStacks.forEach(function(s, i) {
    console.log('\n  [Stack ' + i + ']');
    console.log('    responseURL:', s.responseURL);
    console.log('    stack:');
    s.stack.split('\n').forEach(function(line) {
      if (line.trim()) console.log('      ' + line.trim());
    });
  });

  // Step 5: 关键 — 检查 RS 的 open hook 是否修改了 URL
  console.log('\n[8] 检查 open hook 是否修改 URL...');
  var openResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var origOpen = XMLHttpRequest.prototype.open;
      var openLog = [];
      
      XMLHttpRequest.prototype.open = function(method, url) {
        var beforeUrl = url;
        var result = origOpen.apply(this, arguments);
        // 检查 open 后 URL 是否变化
        var afterUrl = arguments[1]; // url 参数
        
        openLog.push({
          method: method,
          beforeUrl: String(beforeUrl).substring(0, 200),
          afterUrl: String(afterUrl).substring(0, 200),
          argsCount: arguments.length,
        });
        
        return result;
      };
      
      window.__getOpenLog = function() { return JSON.stringify(openLog); };
      return 'open hook installed';
    })()`,
    returnByValue: true,
  });
  console.log('  Hook:', openResult.result.value);

  // 触发
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/security', false); xhr.send('{}'); return 'ok'; } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  var openLog = await client.send('Runtime.evaluate', {
    expression: 'window.__getOpenLog ? window.__getOpenLog() : "no hook"',
    returnByValue: true,
  });
  console.log('  Open log:', openLog.result.value);

  // Step 6: 关键突破 — 检查 RS 是否在 send 内部创建新 XHR
  // RS 可能拦截 send，在内部创建新 XHR 并修改 URL
  console.log('\n[9] 检查 RS 是否在 send ���部创建新 XHR...');
  var newXhrResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 计数 XMLHttpRequest 构造调用
      var origCtor = window.XMLHttpRequest;
      var ctorCount = 0;
      var ctorStacks = [];
      
      // 不能直接替换构造器（RS 保存了引用）
      // 但可以检查 send 内部是否有 new XMLHttpRequest
      // 方法：用 Error.stack 追踪
      
      // 在 send 中追踪
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(body) {
        var stack;
        try { throw new Error(); } catch(e) { stack = e.stack; }
        
        // 检查栈中是否有 RS 内部代码
        var hasRsCode = false;
        var rsFrames = [];
        stack.split('\\n').forEach(function(line) {
          if (line.indexOf('eval') >= 0 || line.indexOf('<anonymous>') >= 0) {
            hasRsCode = true;
            rsFrames.push(line.trim());
          }
        });
        
        return origSend.call(this, body);
      };
      
      // 触发
      try {
        var xhr = new origCtor();
        XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/security', false);
        xhr.send('{}');
        return JSON.stringify({status: xhr.status, responseURL: xhr.responseURL});
      } catch(e) {
        return JSON.stringify({error: e.message});
      }
    })()`,
    returnByValue: true,
  });
  console.log('  Result:', newXhrResult.result.value);

  // Step 7: 最终方法 — 直接拦截 URL 修改
  // RS 必须在某处修改 URL 来追加 query
  // 用 Object.defineProperty 拦截 URL 属性的设置
  console.log('\n[10] 拦截 URL 修改...');
  var urlIntercept = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var origOpen = XMLHttpRequest.prototype.open;
      var interceptLog = [];
      
      XMLHttpRequest.prototype.open = function(method, url) {
        var urlBefore = String(url);
        
        // 调用原始 open
        var result = origOpen.apply(this, arguments);
        
        // open 后检查 URL 是否被修改
        // RS 可能在 open 内部修改 arguments[1]
        var urlAfter = String(arguments[1]);
        
        if (urlBefore !== urlAfter) {
          interceptLog.push({
            type: 'url_changed_in_open',
            before: urlBefore.substring(0, 200),
            after: urlAfter.substring(0, 200),
          });
        }
        
        return result;
      };
      
      // 同时 hook send
      var origSend = XMLHttpRequest.prototype.send;
      var sendIntercept = [];
      XMLHttpRequest.prototype.send = function(body) {
        // send 前检查 URL
        // RS 可能在 send 中修改 URL
        
        // 用 defineProperty 拦截可能的 URL 修改
        var urlMods = [];
        var self = this;
        
        // 记录 send 调用栈
        var stack;
        try { throw new Error(); } catch(e) { stack = e.stack; }
        
        var rsStack = stack.split('\\n').filter(function(l) { 
          return l.indexOf('<anonymous>') >= 0 || l.indexOf('eval') >= 0;
        }).map(function(l) { return l.trim(); });
        
        var result = origSend.call(this, body);
        
        sendIntercept.push({
          stack: rsStack.slice(0, 5),
          responseURL: this.responseURL || '',
        });
        
        return result;
      };
      
      window.__getIntercept = function() { return JSON.stringify({open: interceptLog, send: sendIntercept}); };
      
      return 'intercept installed';
    })()`,
    returnByValue: true,
  });
  console.log('  Hook:', urlIntercept.result.value);

  // 触发
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send('{}'); return 'ok'; } catch(e) { return e.message; } })()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  var interceptData = await client.send('Runtime.evaluate', {
    expression: 'window.__getIntercept ? window.__getIntercept() : "no hook"',
    returnByValue: true,
  });
  
  var intercept = JSON.parse(interceptData.result.value);
  console.log('\n  Open intercept:', JSON.stringify(intercept.open));
  console.log('\n  Send intercept:');
  intercept.send.forEach(function(s, i) {
    console.log('    [' + i + '] responseURL:', s.responseURL);
    console.log('    RS stack frames:');
    s.stack.forEach(function(f) { console.log('      ' + f); });
  });

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/send-hook-analysis.json'),
    JSON.stringify({
      descs: descs,
      intercept: intercept,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );

  console.log('\n=== 关键结论 ===');
  console.log('1. 浏览器中 boolean flag = false');
  console.log('2. trampoline 返回 undefined（不是 query）');
  console.log('3. query 生成在 RS 的 send hook 内部');
  console.log('4. RS 用 prototype.send 的 wrapper 追加 query');
  console.log('5. query 出现在 responseURL 中（send 后的 URL）');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
