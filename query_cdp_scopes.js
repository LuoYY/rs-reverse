/**
 * query_cdp_scopes.js — 提取 send hook 的闭包 Scopes
 *
 * 重大突破：
 * 1. Function.prototype.toString.call(sendFn) 返回了真实源码！
 * 2. send/open/fetch 都是同一个函数 _$dc（VM trampoline！）
 * 3. send hook 有 [[Scopes]]: Scopes[5] → 5 层闭包
 *
 * 关键发现：send = open = fetch = _$dc = VM trampoline！
 * RS 把同一个 VM trampoline 函数赋给了 send/open/fetch
 * 这个 trampoline 执行不同的 VM bytecode（根据调用上下文）
 *
 * send 的 trampoline 和 XHR 实例上的 trampoline 是同一个！
 * 但 send 的 VM bytecode 执行 query 生成逻辑
 * XHR 实例上的 trampoline 执行其他逻辑
 *
 * 下一步：
 * 1. 提取 [[Scopes]] 获取闭包变量
 * 2. 提取 [[FunctionLocation]] 获取源码位置
 * 3. 在 VM 执行时 dump scope 变量
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 提取 send hook 闭包 Scopes ===\n');

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

  // Step 1: 获取 send 函数的 objectId
  console.log('\n[3] 获取 send 函数...');
  var sendEval = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
    objectGroup: 'sendFn',
  });
  
  var sendObjectId = sendEval.result.objectId;
  console.log('  objectId:', sendObjectId);

  // Step 2: 获取 [[FunctionLocation]]
  console.log('\n[4] 获取 FunctionLocation...');
  var props = await client.send('Runtime.getProperties', {
    objectId: sendObjectId,
    ownProperties: true,
  });
  
  if (props.internalProperties) {
    for (var ip of props.internalProperties) {
      console.log('  ' + ip.name + ':', ip.value ? JSON.stringify(ip.value).substring(0, 200) : 'none');
      
      if (ip.name === '[[FunctionLocation]]' && ip.value && ip.value.objectId) {
        // 获取 FunctionLocation 详情
        var locProps = await client.send('Runtime.getProperties', {
          objectId: ip.value.objectId,
          ownProperties: true,
        });
        console.log('    Location details:');
        locProps.result.forEach(function(p) {
          console.log('      ' + p.name + ':', p.value ? p.value.value || p.value.description : '');
        });
      }
      
      if (ip.name === '[[Scopes]]' && ip.value && ip.value.objectId) {
        console.log('\n[5] 提取 Scopes...');
        var scopeProps = await client.send('Runtime.getProperties', {
          objectId: ip.value.objectId,
          ownProperties: true,
        });
        
        console.log('  Scope chain length:', scopeProps.result.length);
        
        for (var si = 0; si < scopeProps.result.length; si++) {
          var scope = scopeProps.result[si];
          console.log('\n  [Scope ' + si + '] ' + scope.name);
          
          if (scope.value && scope.value.objectId) {
            var scopeVars = await client.send('Runtime.getProperties', {
              objectId: scope.value.objectId,
              ownProperties: true,
            });
            
            scopeVars.result.forEach(function(v) {
              var val = v.value;
              var desc = '';
              if (val) {
                if (val.type === 'function') {
                  desc = val.description ? val.description.substring(0, 150) : '';
                } else if (val.type === 'object') {
                  desc = val.description ? val.description.substring(0, 150) : '';
                  // 如果是数组，获取长度
                  if (val.description && val.description.indexOf('Array') >= 0) {
                    desc += ' (length info)';
                  }
                } else if (val.type === 'string') {
                  desc = val.value ? '"' + String(val.value).substring(0, 100) + '"' : '';
                } else if (val.type === 'number') {
                  desc = val.value !== undefined ? String(val.value) : val.description || '';
                } else if (val.type === 'undefined') {
                  desc = 'undefined';
                } else {
                  desc = val.description || val.value || '';
                }
              }
              console.log('    ' + v.name + ': ' + (val ? val.type : '?') + ' = ' + String(desc).substring(0, 120));
            });
            
            // 如果 scope 变量太多，只显示前 30 个
            if (scopeVars.result.length > 30) {
              console.log('    ... and ' + (scopeVars.result.length - 30) + ' more');
            }
          }
        }
      }
    }
  }

  // Step 3: 关键 — 检查 send/open/fetch 是否真的是同一个函数
  console.log('\n\n[6] 验证 send/open/fetch 是否相同...');
  var sameCheck = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var send = XMLHttpRequest.prototype.send;
      var open = XMLHttpRequest.prototype.open;
      var fetch = window.fetch;
      
      return JSON.stringify({
        sendOpenSame: send === open,
        sendFetchSame: send === fetch,
        openFetchSame: open === fetch,
        sendName: send.name,
        openName: open.name,
        fetchName: fetch ? fetch.name : 'no fetch',
      });
    })()`,
    returnByValue: true,
  });
  console.log('  Same check:', sameCheck.result.value);

  // Step 4: 关键 — 在浏览器中直接调用 send hook 来生成 query
  // send hook 是 VM trampoline，执行时会生成 query
  // 如果我们能提取 query 生成后的结果...
  console.log('\n[7] 直接提取 send hook 执行结果...');
  
  // send hook 在内部调用真正的 native send
  // 但 query 生成在 native send 之前
  // 我们需要 hook URL 来捕获 query
  
  // 方法：用 CDP Network.requestWillBeSent 来捕获实际发出的 URL
  var capturedUrls = [];
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0) {
      capturedUrls.push({
        url: params.request.url,
        method: params.request.method,
      });
    }
  });

  // 触发多个请求
  console.log('  触发请求...');
  for (var i = 0; i < 3; i++) {
    await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.send('{}'); } catch(e) {} return 'ok'; })()`,
      returnByValue: true,
    });
  }
  
  await page.waitForTimeout(1000);
  
  console.log('  Captured URLs:', capturedUrls.length);
  capturedUrls.forEach(function(c, i) {
    var qMatch = c.url.match(/r20SZOQm=([^&]+)/);
    console.log('  [' + i + '] query:', qMatch ? qMatch[1] : 'none');
  });

  // Step 5: 关键突破 — 提取 VM 配置对象
  // send hook 的源码中有 _$jW（配置对象）
  // _$jW._$hQ 是 bytecode
  // _$jW._$ju 是 cache flag
  // _$jW._$aI 是 scope size
  // _$jW._$gL 是常量池
  console.log('\n[8] 提取 VM 配置对象...');
  
  // 从 Scopes 中找到配置对象
  // send hook 的闭包中有 _$jW
  // 我们已经在 Step 2 中提取了 Scopes
  // 现在需要找到 _$jW 并导出其属性
  
  // 方法：在动态代码执行时，_$jW 是闭包变量
  // 但我们可以通过 send hook 的执行来间接获取
  
  // 直接方法：在浏览器中用 Function.prototype.toString.call 获取源码
  // 然后从源码中提取变量名
  // 再用 eval 来访问这些变量
  
  // 但闭包变量不能从外部访问
  // 唯一方法：用 CDP Debugger 在 send hook 内部设断点
  
  // 方法：用 Debugger.setBreakpointOnFunctionCall
  console.log('\n[9] 用 Debugger 在 send hook 内部设断点...');
  
  // 获取 send 函数的 scriptId 和位置
  var funcLocation = await client.send('Runtime.evaluate', {
    expression: `(function(){
      var sendFn = XMLHttpRequest.prototype.send;
      // 获取真实源码
      var realStr = Function.prototype.toString.call(sendFn);
      
      // 从源码提取配置对象名
      var configMatch = realStr.match(/if\\(([_.$a-zA-Z0-9]+)\\.([_.$a-zA-Z0-9]+)\\)/);
      var dispMatch = realStr.match(/([_.$a-zA-Z0-9]+)\\(([_.$a-zA-Z0-9]+),0,([_.$a-zA-Z0-9]+)\\.([_.$a-zA-Z0-9]+)\\.length,([_.$a-zA-Z0-9]+)\\)/);
      var exitMatch = realStr.match(/([_.$a-zA-Z0-9]+)=([_.$a-zA-Z0-9]+)\\[4\\],([_.$a-zA-Z0-9]+)=([_.$a-zA-Z0-9]+)\\[5\\]/);
      
      return JSON.stringify({
        realStr: realStr.substring(0, 600),
        configObj: configMatch ? configMatch[1] : null,
        configProp: configMatch ? configMatch[2] : null,
        dispatcher: dispMatch ? dispMatch[1] : null,
        bytecodeObj: dispMatch ? dispMatch[3] : null,
        bytecodeProp: dispMatch ? dispMatch[4] : null,
        argsArr: exitMatch ? exitMatch[2] : null,
        exitCodeVar: exitMatch ? exitMatch[1] : null,
        retValVar: exitMatch ? exitMatch[3] : null,
      });
    })()`,
    returnByValue: true,
  });
  
  var parsed = JSON.parse(funcLocation.result.value);
  console.log('  Config obj:', parsed.configObj);
  console.log('  Config prop:', parsed.configProp);
  console.log('  Dispatcher:', parsed.dispatcher);
  console.log('  Bytecode obj:', parsed.bytecodeObj + '.' + parsed.bytecodeProp);
  console.log('  Args array:', parsed.argsArr);
  console.log('  Exit code var:', parsed.exitCodeVar);
  console.log('  Return val var:', parsed.retValVar);
  console.log('\n  Full source:');
  console.log(parsed.realStr);

  // 总结
  console.log('\n=== 核心发现 ===');
  console.log('1. send/open/fetch 都是同一个 VM trampoline 函数');
  console.log('2. Function.prototype.toString.call() 绕过了 [native code] 伪装');
  console.log('3. send hook 有 [[Scopes]]: Scopes[5]（5 层闭包）');
  console.log('4. VM 配置对象:', parsed.configObj);
  console.log('5. VM bytecode:', parsed.bytecodeObj + '.' + parsed.bytecodeProp);
  console.log('6. VM dispatcher:', parsed.dispatcher);
  console.log('\n关键：send hook 执行时，VM bytecode 包含 query 生成逻辑');
  console.log('但 VM exit code=1, return value=undefined（与沙箱一致）');
  console.log('query 生成可能发生在 VM 执行过程中的副作用（修改 URL）');

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/send-hook-scopes.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      configObj: parsed.configObj,
      configProp: parsed.configProp,
      dispatcher: parsed.dispatcher,
      bytecodeProp: parsed.bytecodeProp,
      sameCheck: JSON.parse(sameCheck.result.value),
      capturedUrls: capturedUrls,
      realStr: parsed.realStr,
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
