/**
 * query_cdp_breakpoint.js — CDP 条件断点提取 query 生成过程
 *
 * 核心策略：
 * 沙箱中 trampoline 返回 "" 的根因是 VM 内部条件不满足。
 * 但在浏览器中 RS 正常生成 query。
 * 
 * 突破口：在浏览器中用 CDP Debugger 在 RS 动态代码的关键位置设断点，
 * 提取 trampoline 闭包变量（配置对象 _$jv 和 VM scope），
 * 对比浏览器 vs 沙箱的差异，找到导致返回 "" 的条件。
 *
 * 方法：
 * 1. 浏览器加载页面 → reload → RS 启用 query
 * 2. 用 CDP Debugger.setBreakpointOnFunctionCall 在 XMLHttpRequest.prototype.send 上设断点
 * 3. 当业务代码调用 xhr.send() 时暂停
 * 4. 在暂停时检查 call frame 中的 RS 变量
 * 5. 提取 trampoline 函数和配置对象
 *
 * 或者更直接：
 * 1. 在浏览器中 hook XHR open，获取 trampoline 函数引用
 * 2. 用 CDP Debugger 在 trampoline 函数内部设断点
 * 3. 在 VM dispatcher 调用前后提取 args[4] 和 args[5]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP 条件断点提取 query 生成核心 ===\n');

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

  // 收集所有脚本
  var scriptList = [];
  client.on('Debugger.scriptParsed', function(params) {
    if (params.url && params.url.indexOf('kmOJZ0KVxJ0R') >= 0) {
      // RS 外层 JS
      console.log('[RS outer JS] scriptId=' + params.scriptId + ' url=' + params.url);
    }
    scriptList.push({
      scriptId: params.scriptId,
      url: params.url || '',
      length: params.length || 0,
      startLine: params.startLine || 0,
      hash: params.hash || '',
    });
  });

  // 监听网络请求
  var queryRequests = [];
  client.on('Network.requestWillBeSent', function(params) {
    var url = params.request.url;
    if (url.indexOf('r20SZOQm=') >= 0) {
      var qMatch = url.match(/r20SZOQm=([^&]+)/);
      queryRequests.push({
        path: (url.match(/https?:\/\/[^/]+([^?]+)/) || [])[1] || url,
        query: qMatch ? qMatch[1] : '',
        method: params.request.method,
      });
    }
  });

  // 首次加载 + reload
  console.log('[1] 首次加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 关键方法：在浏览器中提取 RS 的 trampoline 函数和配置
  // RS 在 XHR.open 时设置 trampoline 到实例上
  // 我们 hook open 来捕获这个赋值
  console.log('\n[3] 提取 RS trampoline 和配置...');

  var extractResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        // 创建 XHR 并 open，让 RS 设置 trampoline
        var xhr = new XMLHttpRequest();
        var origOpen = xhr.open.bind(xhr);
        
        // RS 会 hook open，所以直接调用让 RS 处理
        // 但我们需要绕过 RS 的 open hook 来观察
        // 方法：创建 XHR 后，检查实例上的 RS 属性
        
        // RS 的 open hook 会设置 trampoline 和 flag
        // 直接调用 open（RS hook 会执行）
        XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/test', true);
        
        // 检查实例上的 RS 属性
        var rsProps = {};
        var allProps = Object.getOwnPropertyNames(xhr);
        for (var i = 0; i < allProps.length; i++) {
          var k = allProps[i];
          if (k.indexOf('_$') === 0 || k.indexOf('_$') === 0) {
            var v = xhr[k];
            rsProps[k] = {
              type: typeof v,
              isFunc: typeof v === 'function',
              val: typeof v === 'boolean' ? v : (typeof v === 'function' ? v.toString().substring(0, 300) : String(v).substring(0, 100)),
            };
          }
        }
        
        return JSON.stringify({rsProps: rsProps, propCount: Object.keys(rsProps).length});
      } catch(e) {
        return JSON.stringify({error: e.message, stack: e.stack ? e.stack.substring(0, 300) : ''});
      }
    })()`,
    returnByValue: true,
  });
  
  var extracted = JSON.parse(extractResult.result.value);
  console.log('  RS properties:', extracted.propCount);
  if (extracted.rsProps) {
    Object.keys(extracted.rsProps).forEach(function(k) {
      var p = extracted.rsProps[k];
      console.log('  ' + k + ':', p.type, p.isFunc ? '(function)' : p.val);
      if (p.isFunc) {
        console.log('    code:', p.val);
      }
    });
  }
  if (extracted.error) console.log('  Error:', extracted.error);

  // 方法 2：直接在浏览器中调用 trampoline 并捕获返回值
  console.log('\n[4] 直接调用 trampoline...');
  var trampResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
        
        // 找到 trampoline 函数
        var trampName = null;
        var allProps = Object.getOwnPropertyNames(xhr);
        for (var i = 0; i < allProps.length; i++) {
          var k = allProps[i];
          if (k.indexOf('_$') === 0 && typeof xhr[k] === 'function') {
            trampName = k;
            break;
          }
        }
        
        if (!trampName) return JSON.stringify({error: 'no trampoline found'});
        
        // 设置 boolean flag 为 true
        for (var i = 0; i < allProps.length; i++) {
          var k = allProps[i];
          if (k.indexOf('_$') === 0 && typeof xhr[k] === 'boolean') {
            xhr[k] = true;
          }
        }
        
        // 调用 trampoline
        var result = xhr[trampName].call(xhr, '{}');
        
        return JSON.stringify({
          trampName: trampName,
          result: String(result).substring(0, 200),
          resultType: typeof result,
          resultLen: typeof result === 'string' ? result.length : -1,
        });
      } catch(e) {
        return JSON.stringify({error: e.message});
      }
    })()`,
    returnByValue: true,
  });
  
  var tramp = JSON.parse(trampResult.result.value);
  console.log('  Trampoline result:', tramp.result || tramp.error);
  console.log('  Type:', tramp.resultType, 'Length:', tramp.resultLen);
  
  if (tramp.resultLen > 10) {
    console.log('\n*** QUERY CAPTURED IN BROWSER! ***');
    console.log('  Query:', tramp.result);
  }

  // 方法 3：在浏览器中检查 RS 的 $_ts 状态
  console.log('\n[5] 检查 RS 状态...');
  var stateResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var result = {};
      result.tsKeys = window.$_ts ? Object.keys(window.$_ts) : [];
      result.tsNsd = window.$_ts ? window.$_ts.nsd : undefined;
      result.tsCd = window.$_ts ? (window.$_ts.cd ? window.$_ts.cd.substring(0, 50) + '...' : undefined) : undefined;
      
      // 检查 cookie
      result.cookie = document.cookie.substring(0, 200);
      
      // 检查是否有 RS 全局变量
      var rsKeys = [];
      try {
        for (var k in window) {
          if (k.indexOf('_$') === 0) rsKeys.push(k);
        }
      } catch(e) {}
      result.rsGlobals = rsKeys.slice(0, 20);
      
      return JSON.stringify(result);
    })()`,
    returnByValue: true,
  });
  console.log('  State:', stateResult.result.value.substring(0, 500));

  // 方法 4：关键突破 — 在浏览器中提取 RS 动态代码
  // RS 动态代码是 eval 生成的，需要找到它的 scriptId
  console.log('\n[6] 查找 RS 动态代码脚本...');
  
  // 找 eval 生成的脚本（无 url 或 url 为空）
  var evalScripts = scriptList.filter(function(s) {
    return !s.url && s.length > 100000;
  });
  console.log('  Eval scripts (>100KB):', evalScripts.length);
  evalScripts.sort(function(a, b) { return b.length - a.length; });
  evalScripts.slice(0, 5).forEach(function(s) {
    console.log('    scriptId=' + s.scriptId + ' len=' + s.length);
  });

  // 也查找 RS 外层 JS
  var rsOuterScripts = scriptList.filter(function(s) {
    return s.url && s.url.indexOf('kmOJZ0KVxJ0R') >= 0;
  });
  console.log('  RS outer JS scripts:', rsOuterScripts.length);
  rsOuterScripts.forEach(function(s) {
    console.log('    scriptId=' + s.scriptId + ' url=' + s.url);
  });

  // 获取最长的 eval 脚本（RS 动态代码）
  if (evalScripts.length > 0) {
    var dynScriptId = evalScripts[0].scriptId;
    console.log('\n[7] 获取 RS 动态代码 (scriptId=' + dynScriptId + ')...');
    try {
      var src = await client.send('Debugger.getScriptSource', { scriptId: dynScriptId });
      var dynCode = src.scriptSource;
      console.log('  Dynamic code length:', dynCode.length);
      
      // 保存动态代码
      fs.writeFileSync(
        path.join(__dirname, 'output/capture-20080/dyn-code-browser-real.js'),
        dynCode
      );
      console.log('  Saved to output/capture-20080/dyn-code-browser-real.js');
      
      // 搜索关键模式
      console.log('\n  Key patterns:');
      var patterns = ['r20SZOQm', 'charAt', 'createElement', 'numarr2string', 'encryptMode', 'AES'];
      patterns.forEach(function(p) {
        var pos = dynCode.indexOf(p);
        console.log('    "' + p + '":', pos >= 0 ? 'found at ' + pos : 'NOT found');
      });
      
      // 搜索 query 参数名赋值
      var queryAssignPatterns = [
        /\.send\s*\(/,
        /XMLHttpRequest/,
        /\.open\s*\(/,
      ];
      
      // 搜索 trampoline 创建位置
      // trampoline 是 VM 生成的闭包，但在动态代码中有创建逻辑
      var trampolinePatterns = ['arguments', 'apply', 'charCodeAt'];
      trampolinePatterns.forEach(function(p) {
        var count = 0;
        var pos = 0;
        while ((pos = dynCode.indexOf(p, pos)) >= 0) { count++; pos += p.length; if (count > 100) break; }
        console.log('    "' + p + '" count:', count);
      });
      
    } catch(e) {
      console.log('  Error:', e.message);
    }
  }

  // 方法 5：用 Debugger.setBreakpointOnFunctionCall 在 send 上设断点
  console.log('\n[8] 在 XMLHttpRequest.send 上设断点...');
  try {
    // 获取 send 函数的 objectId
    var sendRef = await client.send('Runtime.evaluate', {
      expression: 'XMLHttpRequest.prototype.send',
      objectId: undefined,
    });
    console.log('  send function type:', sendRef.result.type);
    if (sendRef.result.objectId) {
      console.log('  send objectId:', sendRef.result.objectId);
      
      // 尝试设断点
      // Debugger.setBreakpointOnFunctionCall 需要 objectId
      // 但这个 API 在某些版本中不可用
      // 改用 Debugger.setBreakpointByUrl
    }
  } catch(e) {
    console.log('  Breakpoint error:', e.message);
  }

  // 方法 6：最直接的方法 — 在浏览器中 hook XHR 并捕获 query
  console.log('\n[9] Hook XHR open 捕获 query 生成...');
  var hookResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 保存原始 open
      var origOpen = XMLHttpRequest.prototype.open;
      var captured = [];
      
      // 替换 open
      XMLHttpRequest.prototype.open = function(method, url) {
        // 检查 URL 是否有 query
        if (url && url.indexOf('r20SZOQm=') >= 0) {
          var qMatch = url.match(/r20SZOQm=([^&]+)/);
          captured.push({
            method: method,
            path: (url.match(/([^?]+)/) || [])[1] || url,
            query: qMatch ? qMatch[1] : '',
          });
        }
        return origOpen.apply(this, arguments);
      };
      
      // 保存捕获函数到全局
      window.__getCaptured = function() { return JSON.stringify(captured); };
      
      return 'hook installed';
    })()`,
    returnByValue: true,
  });
  console.log('  Hook:', hookResult.result.value);

  // 触发请求
  console.log('\n[10] 触发请求...');
  var endpoints = [
    { method: 'POST', path: '/px-gateway/GatewayConfig/getGatewayConfig' },
    { method: 'POST', path: '/px-gateway/GatewayConfig/security' },
    { method: 'GET', path: '/px-gateway/GatewayConfig/security' },
  ];

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open(${JSON.stringify(ep.method)}, ${JSON.stringify(ep.path)}, false); xhr.send({}.toString()); return xhr.status; } catch(e) { return e.message; } })()`,
      returnByValue: true,
    });
  }

  await page.waitForTimeout(2000);

  // 获取捕获的 query
  var captured = await client.send('Runtime.evaluate', {
    expression: 'window.__getCaptured ? window.__getCaptured() : "no hook"',
    returnByValue: true,
  });
  console.log('\n  Captured queries:', captured.result.value);

  // 方法 7：在浏览器中直接提取 RS 的 query 生成函数引用
  // RS 在 XHR open hook 中设置 trampoline
  // trampoline 是一个闭包，包含 VM 配置
  // 我们可以提取 trampoline 的闭包变量
  console.log('\n[11] 深入提取 trampoline 闭包...');
  var deepExtract = await client.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var xhr = new XMLHttpRequest();
        XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/test', true);
        
        // 找到 trampoline
        var trampName = null;
        var boolName = null;
        var allProps = Object.getOwnPropertyNames(xhr);
        for (var i = 0; i < allProps.length; i++) {
          var k = allProps[i];
          if (k.indexOf('_$') === 0) {
            if (typeof xhr[k] === 'function') trampName = k;
            if (typeof xhr[k] === 'boolean') boolName = k;
          }
        }
        
        if (!trampName) return JSON.stringify({error: 'no trampoline'});
        
        // 获取 trampoline 源码
        var trampStr = xhr[trampName].toString();
        
        // 从源码中提取闭包变量名
        // 模式: if(XXX.YYY) → XXX=配置对象
        var configMatch = trampStr.match(/if\\(([_.$a-zA-Z0-9]+)\\.([_.$a-zA-Z0-9]+)\\)/);
        var configObj = configMatch ? configMatch[1] : null;
        var configProp = configMatch ? configMatch[2] : null;
        
        // 模式: ZZZ(XXX,0,XXX.YYY.length,WWW) → ZZZ=dispatcher, WWW=args
        var dispMatch = trampStr.match(/([_.$a-zA-Z0-9]+)\\(([_.$a-zA-Z0-9]+),0,([_.$a-zA-Z0-9]+)\\.([_.$a-zA-Z0-9]+)\\.length,([_.$a-zA-Z0-9]+)\\)/);
        
        // 模式: exitCode=args[4], retVal=args[5]
        var exitMatch = trampStr.match(/([_.$a-zA-Z0-9]+)=([_.$a-zA-Z0-9]+)\\[4\\],([_.$a-zA-Z0-9]+)=([_.$a-zA-Z0-9]+)\\[5\\]/);
        
        return JSON.stringify({
          trampName: trampName,
          boolName: boolName,
          boolVal: boolName ? xhr[boolName] : null,
          trampStr: trampStr,
          configObj: configObj,
          configProp: configProp,
          dispatcher: dispMatch ? dispMatch[1] : null,
          argsArr: exitMatch ? exitMatch[2] : null,
          exitCodeVar: exitMatch ? exitMatch[1] : null,
          retValVar: exitMatch ? exitMatch[3] : null,
        });
      } catch(e) {
        return JSON.stringify({error: e.message, stack: e.stack ? e.stack.substring(0, 200) : ''});
      }
    })()`,
    returnByValue: true,
  });
  
  var deep = JSON.parse(deepExtract.result.value);
  console.log('  Trampoline name:', deep.trampName);
  console.log('  Boolean flag:', deep.boolName, '=', deep.boolVal);
  console.log('  Config obj:', deep.configObj);
  console.log('  Config prop:', deep.configProp);
  console.log('  Dispatcher:', deep.dispatcher);
  console.log('  Args array:', deep.argsArr);
  console.log('  Exit code var:', deep.exitCodeVar);
  console.log('  Return val var:', deep.retValVar);
  console.log('\n  Trampoline code:');
  console.log(deep.trampStr ? deep.trampStr.substring(0, 600) : 'none');
  if (deep.error) console.log('  Error:', deep.error);

  // 保存所有结果
  var allResults = {
    timestamp: new Date().toISOString(),
    extracted: extracted,
    tramp: tramp,
    deep: deep,
    queryRequests: queryRequests,
  };
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/cdp-breakpoint-results.json'),
    JSON.stringify(allResults, null, 2)
  );
  console.log('\nSaved to output/capture-20080/cdp-breakpoint-results.json');

  // 总结
  console.log('\n=== 总结 ===');
  console.log('Query requests captured:', queryRequests.length);
  console.log('Trampoline in browser:', deep.trampName || 'not found');
  console.log('Boolean flag:', deep.boolName + '=' + deep.boolVal);
  if (deep.boolVal === false) {
    console.log('\n*** 关键发现：浏览器中 boolean flag 也是 false！ ***');
    console.log('*** 但浏览器中 RS 仍然生成 query ***');
    console.log('*** 说明 query 生成不依赖这个 flag ***');
    console.log('*** query 生成在 RS 的 send hook 内部，不在 trampoline 中 ***');
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
