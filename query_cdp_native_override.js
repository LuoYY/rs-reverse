/**
 * query_cdp_native_override.js — 突破 RS 的 [native code] 伪装
 *
 * 重大发现：
 * send/open 的 Function.name = "_$ka" → RS 替换了 prototype.send！
 * RS 用 Object.defineProperty 伪装成 [native code]
 * fetch 也被 hook（所有 fetch 请求也有 query）
 *
 * 这意味着：
 * 1. RS 的 send hook (_$ka) 在内部生成 query 并追加到 URL
 * 2. 然后调用真正的 native send
 * 3. trampoline 不是核心（只是辅助）
 *
 * 新策略：
 * 1. 提取 _$ka 函数的源码（绕过 [native code] 伪装）
 * 2. 在 _$ka 中找到 query 生成逻辑
 * 3. 或者：直接在浏览器中调用 _$ka 来为任意 URL 生成 query
 * 4. 或者：提取 _$ka 中的加密密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 突破 RS [native code] 伪装 ===\n');

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

  // 收集脚本
  var scriptList = [];
  client.on('Debugger.scriptParsed', function(params) {
    scriptList.push({
      scriptId: params.scriptId,
      url: params.url || '',
      length: params.length || 0,
    });
  });

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // Step 1: 提取 RS send hook (_$ka) 的真实源码
  console.log('\n[3] 提取 RS send hook 源码...');
  
  // 方法：Function.prototype.toString 返回 [native code]
  // 但我们可以用其他方式获取源码
  // 1. 用 Function.prototype.toString.call() 绕过可能的 toString hook
  // 2. 用 CDP Runtime.getProperties 获取函数对象
  // 3. 用 CDP Debugger.getFunctionSource（如果可用）
  
  var extractResult = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var result = {};
      var proto = XMLHttpRequest.prototype;
      
      // 获取 send 函数信息
      var sendFn = proto.send;
      result.sendName = sendFn.name;
      result.sendLength = sendFn.length;
      result.sendToString = sendFn.toString();
      
      // 尝试获取函数源码（绕过 toString hook）
      try {
        result.sendRealToString = Function.prototype.toString.call(sendFn);
      } catch(e) {
        result.sendRealToString = 'error: ' + e.message;
      }
      
      // 获取 open 函数信息
      var openFn = proto.open;
      result.openName = openFn.name;
      result.openLength = openFn.length;
      result.openToString = openFn.toString();
      
      // 检查 fetch
      result.fetchName = window.fetch ? window.fetch.name : 'no fetch';
      result.fetchToString = window.fetch ? window.fetch.toString().substring(0, 200) : 'no fetch';
      
      // 关键：获取 send 函数的 [[Scopes]] 或闭包变量
      // 用 CDP Runtime.evaluate 无法直接获取闭包
      // 但可以检查 send 函数是否绑定到某个对象
      
      // 检查 send 是否有自定义属性
      var sendProps = Object.getOwnPropertyNames(sendFn);
      result.sendProps = sendProps;
      
      // 检查 prototype.constructor
      result.protoCtorName = proto.constructor.name;
      result.protoCtorToString = proto.constructor.toString().substring(0, 200);
      
      // 关键：RS 可能用 Function.prototype.bind 创建了 bound function
      // bound function 的 name 以 "bound " 开头
      // 但 _$ka 不是 bound function
      
      return JSON.stringify(result);
    })()`,
    returnByValue: true,
  });
  
  var extracted = JSON.parse(extractResult.result.value);
  console.log('  send name:', extracted.sendName);
  console.log('  send length:', extracted.sendLength);
  console.log('  send toString:', extracted.sendToString);
  console.log('  send real toString:', extracted.sendRealToString);
  console.log('  open name:', extracted.openName);
  console.log('  open toString:', extracted.openToString);
  console.log('  fetch name:', extracted.fetchName);
  console.log('  fetch toString:', extracted.fetchToString);
  console.log('  send props:', extracted.sendProps);
  console.log('  proto constructor:', extracted.protoCtorName, extracted.protoCtorToString);

  // Step 2: 用 CDP Debugger 获取 RS 动态代码
  console.log('\n[4] 获取 RS 动态代码...');
  
  // 找到 eval 生成的脚本
  var evalScripts = scriptList.filter(function(s) {
    return !s.url && s.length > 100000;
  });
  evalScripts.sort(function(a, b) { return b.length - a.length; });
  console.log('  Eval scripts:', evalScripts.length);
  evalScripts.slice(0, 5).forEach(function(s) {
    console.log('    scriptId=' + s.scriptId + ' len=' + s.length);
  });

  // 获取最长的 eval 脚本
  var dynCode = '';
  for (var i = 0; i < evalScripts.length; i++) {
    try {
      var src = await client.send('Debugger.getScriptSource', { scriptId: evalScripts[i].scriptId });
      if (src.scriptSource && src.scriptSource.length > 200000) {
        dynCode = src.scriptSource;
        console.log('  Got RS dynamic code: scriptId=' + evalScripts[i].scriptId + ' length=' + dynCode.length);
        break;
      }
    } catch(e) {}
  }

  if (dynCode) {
    // 搜索 _$ka（send hook 函数名）
    console.log('\n[5] 在动态代码中搜索 send hook...');
    
    // send hook 函数名是 _$ka（但每次会话变化）
    // 搜索 prototype.send 赋值
    var sendAssignPatterns = [
      /\.send\s*=\s*/,
      /prototype\.send\s*=\s*/,
      /defineProperty.*send/,
    ];
    
    sendAssignPatterns.forEach(function(pat) {
      var regex = new RegExp(pat.source, 'g');
      var match;
      while ((match = regex.exec(dynCode)) !== null) {
        var pos = match.index;
        var ctx = dynCode.substring(pos, Math.min(dynCode.length, pos + 300));
        console.log('\n  Found at pos ' + pos + ':');
        console.log('  ' + ctx.substring(0, 250));
      }
    });

    // 搜索 fetch hook
    console.log('\n\n[6] 搜索 fetch hook...');
    var fetchPatterns = [
      /window\.fetch\s*=\s*/,
      /fetch\s*=\s*/,
      /defineProperty.*fetch/,
    ];
    
    fetchPatterns.forEach(function(pat) {
      var regex = new RegExp(pat.source, 'g');
      var match;
      while ((match = regex.exec(dynCode)) !== null) {
        var pos = match.index;
        var ctx = dynCode.substring(pos, Math.min(dynCode.length, pos + 300));
        console.log('\n  Found at pos ' + pos + ':');
        console.log('  ' + ctx.substring(0, 250));
      }
    });

    // 搜索 [native code] 伪装
    console.log('\n\n[7] 搜索 [native code] 伪装...');
    var nativeCodePos = dynCode.indexOf('[native code]');
    if (nativeCodePos >= 0) {
      console.log('  Found at pos', nativeCodePos);
      var ctx = dynCode.substring(Math.max(0, nativeCodePos - 200), nativeCodePos + 200);
      console.log('  Context:', ctx);
    }
    
    // 搜索 toString 覆写
    var toStringOverridePatterns = [
      'toString',
      'native code',
      'Function.prototype.toString',
    ];
    
    toStringOverridePatterns.forEach(function(p) {
      var pos = dynCode.indexOf(p);
      if (pos >= 0) {
        var count = 0;
        var searchPos = 0;
        while ((searchPos = dynCode.indexOf(p, searchPos)) >= 0 && count < 5) {
          count++;
          searchPos += p.length;
        }
        console.log('  "' + p + '" found ' + count + ' times');
      }
    });

    // 搜索 query 参数名
    console.log('\n[8] 搜索 query 参数名...');
    // query 参数名来自 keys[7].split(';')[1]
    // 搜索 split(';') 
    var splitPatterns = [
      /split\(["']["']\)/,
      /split\(["'];["']\)/,
    ];
    
    splitPatterns.forEach(function(pat) {
      var regex = new RegExp(pat.source, 'g');
      var match;
      while ((match = regex.exec(dynCode)) !== null) {
        var pos = match.index;
        var ctx = dynCode.substring(Math.max(0, pos - 100), Math.min(dynCode.length, pos + 200));
        console.log('\n  Found split at pos ' + pos + ':');
        console.log('  ' + ctx);
      }
    });

    // 保存动态代码
    fs.writeFileSync(
      path.join(__dirname, 'output/capture-20080/rs-dyn-code-extracted.js'),
      dynCode
    );
    console.log('\n  Saved to output/capture-20080/rs-dyn-code-extracted.js');
  }

  // Step 3: 关键 — 用 CDP Debugger 在 send hook 中设断点
  console.log('\n[9] 在 RS send hook 中设断点...');
  
  // RS 的 send hook 名为 _$ka（本次会话）
  // 它在动态代码中定义
  // 我们需要在动态代码中找到 _$ka 的定义位置
  
  if (dynCode && extracted.sendName && extracted.sendName !== 'send') {
    var sendHookName = extracted.sendName;
    console.log('  Send hook name:', sendHookName);
    
    // 在动态代码中搜索 function _$ka 或 _$ka=
    var escapedName = sendHookName.replace(/\$/g, '\\$');
    var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\(', 'g');
    var funcMatch = funcRegex.exec(dynCode);
    
    if (funcMatch) {
      console.log('  Found at pos', funcMatch.index);
      var funcBody = dynCode.substring(funcMatch.index, Math.min(dynCode.length, funcMatch.index + 1000));
      console.log('  Function body (first 800):');
      console.log(funcBody.substring(0, 800));
    } else {
      console.log('  Function not found by name, searching by pattern...');
      
      // 搜索 prototype.send 赋值
      var assignPattern = new RegExp(escapedName + '\\s*=', 'g');
      var assignMatch;
      var count = 0;
      while ((assignMatch = assignPattern.exec(dynCode)) !== null && count < 5) {
        var pos = assignMatch.index;
        var ctx = dynCode.substring(pos, Math.min(dynCode.length, pos + 200));
        console.log('  Assignment at pos ' + pos + ': ' + ctx.substring(0, 150));
        count++;
      }
    }
  }

  // Step 4: 关键突破 — 直接在浏览器中提取 send hook 的源码
  console.log('\n[10] 用 CDP 获取 send hook 源码...');
  
  // 方法：用 CDP Runtime.evaluate 获取函数对象，然后检查其内部属性
  var sendObjResult = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
    objectGroup: 'sendFn',
  });
  
  if (sendObjResult.result.objectId) {
    // 获取函数对象的属性
    var props = await client.send('Runtime.getProperties', {
      objectId: sendObjResult.result.objectId,
      ownProperties: true,
    });
    
    console.log('  Send function properties:');
    props.result.forEach(function(prop) {
      console.log('    ' + prop.name + ':', prop.value ? prop.value.type : 'none', prop.value ? prop.value.description ? prop.value.description.substring(0, 100) : '' : '');
    });
    
    // 获取内部属性
    if (props.internalProperties) {
      console.log('  Internal properties:');
      props.internalProperties.forEach(function(prop) {
        console.log('    ' + prop.name + ':', prop.value ? prop.value.description ? prop.value.description.substring(0, 200) : '' : '');
      });
    }
  }

  // 总结
  console.log('\n=== 关键发现 ===');
  console.log('1. RS 替换了 XMLHttpRequest.prototype.send');
  console.log('2. send 函数的 name = "' + extracted.sendName + '"（RS 内部名）');
  console.log('3. send 伪装为 [native code]（toString 被覆写）');
  console.log('4. RS 的 send hook 在内部生成 query 并追加到 URL');
  console.log('5. fetch 也被 RS hook');
  console.log('6. query 生成逻辑在 send hook (_$ka) 内部');
  console.log('\n下一步：提取 _$ka 的源码 → 找到 query 生成逻辑');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
