/**
 * query_cdp_debugger_v2.js — CDP Debugger + evaluateOnCallFrame 替代方案
 *
 * Patchright 不支持 evaluateOnCallFrame
 * 替代方案：
 * 1. 用 Debugger.setBreakpoint 在动态代码的特定位置设断点
 * 2. 暂停时用 Debugger.evaluateOnCallFrame（标准 CDP 方法）
 * 3. 或者用全局变量传递数据
 *
 * 关键发现：
 * send hook 在 script:43:3:64037 暂停
 * scriptId=43 是 RS 动态代码（189169 bytes）
 * 这是第二次 eval 的动态代码（reload 后）
 *
 * 新策略：
 * 1. 在 script:43 的 send hook 函数体中设精确断点
 * 2. 在 VM dispatcher 调用后暂停
 * 3. 用全局变量提取 args[4] 和 args[5]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP Debugger v2 — 用 setBreakpoint 精确暂停 ===\n');

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
  var evalScripts = [];
  client.on('Debugger.scriptParsed', function(params) {
    if (!params.url && params.length > 100000) {
      evalScripts.push({ scriptId: params.scriptId, length: params.length, startLine: params.startLine, startColumn: params.startColumn });
    }
  });

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 找到 RS 动态代码
  console.log('\n[3] Eval scripts:');
  evalScripts.sort((a, b) => b.length - a.length);
  evalScripts.slice(0, 5).forEach(s => {
    console.log('  scriptId=' + s.scriptId + ' len=' + s.length + ' startLine=' + s.startLine);
  });

  // 获取 send hook 的源码来确定断点位置
  var sendSrc = await client.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  var sendSource = sendSrc.result.value;
  console.log('\n[4] send hook source:');
  console.log(sendSource.substring(0, 400));

  // 从源码中提取关键位置
  // 源码格式: function _$xx(){..._$YY(_$ZZ,0,_$ZZ._$WW.length,_$AA),...}
  // 我们需要在 VM dispatcher 调用后暂停
  // dispatcher 调用后的代码: exitCode=args[4], retVal=args[5]
  // 这部分代码在源码中是: _$_Z=_$$I[4],_$ip=_$$I[5]
  // 或类似的模式

  // 从 send hook 源码中提取变量名
  var dispMatch = sendSource.match(/(_\$[a-zA-Z0-9]+)\((_$[a-zA-Z0-9]+),0,(_$[a-zA-Z0-9]+)\.(_$[a-zA-Z0-9]+)\.length,(_$[a-zA-Z0-9]+)\)/);
  var exitMatch = sendSource.match(/(_$[a-zA-Z0-9]+)=(_$[a-zA-Z0-9]+)\[4\],(_$[a-zA-Z0-9]+)=(_$[a-zA-Z0-9]+)\[5\]/);
  
  if (!dispMatch || !exitMatch) {
    console.log('\n无法从 send 源码中提取变量名');
    console.log('dispMatch:', dispMatch);
    console.log('exitMatch:', exitMatch);
  } else {
    var dispatcherFn = dispMatch[1];
    var configObj = dispMatch[2];
    var bytecodeProp = dispMatch[4];
    var argsArr = exitMatch[2];
    var exitCodeVar = exitMatch[1];
    var retValVar = exitMatch[3];
    
    console.log('\n  dispatcher:', dispatcherFn);
    console.log('  config:', configObj);
    console.log('  bytecode:', configObj + '.' + bytecodeProp);
    console.log('  args:', argsArr);
    console.log('  exitCode:', exitCodeVar);
    console.log('  retVal:', retValVar);

    // 在 send hook 中注入代码来提取 VM 执行结果
    // 方法：用 addInitScript 在 RS 代码执行前注入 hook
    // 或者：在 reload 后用 Runtime.evaluate 注入

    // 关键方法：用全局变量 + 条件断点
    // 1. 在动态代码中找到 send hook 的位置
    // 2. 在 VM dispatcher 调用后设断点
    // 3. 暂停时用 Debugger.evaluateOnCallFrame

    // 获取动态代码源码来确定断点位置
    var dynScriptId = evalScripts[0].scriptId;
    console.log('\n[5] 获取动态代码 scriptId=' + dynScriptId);
    
    var dynSrc = await client.send('Debugger.getScriptSource', { scriptId: dynScriptId });
    var dynCode = dynSrc.scriptSource;
    console.log('  Dynamic code length:', dynCode.length);

    // 在动态代码中搜索 send hook 函数
    var sendFuncMatch = sendSource.match(/function\s+(_\$[a-zA-Z0-9]+)/);
    var sendFuncName = sendFuncMatch ? sendFuncMatch[1] : null;
    console.log('  Send function name:', sendFuncName);

    if (sendFuncName) {
      // 在动态代码中找到这个函数
      var escapedName = sendFuncName.replace(/\$/g, '\\$');
      var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\([^)]*\\)\\s*\\{', 'g');
      var funcMatch = funcRegex.exec(dynCode);
      
      if (funcMatch) {
        var funcStartCol = funcMatch.index;
        console.log('  Found at offset', funcStartCol, 'in dynamic code');
        
        // 找到 VM dispatcher 调用的位置
        var dispInFunc = new RegExp(escapedName.replace(/\$/g, '\\$') + '|' + dispatcherFn.replace(/\$/g, '\\$'), 'g');
        // 实际上需要在函数体内搜索 dispatcherFn 调用
        var funcBody = dynCode.substring(funcMatch.index, funcMatch.index + 1000);
        var dispCallPos = funcBody.indexOf(dispatcherFn + '(');
        
        if (dispCallPos >= 0) {
          // 找到 dispatcher 调用后的分号
          var semicolonPos = funcBody.indexOf(';', dispCallPos);
          if (semicolonPos >= 0) {
            var breakpointCol = funcMatch.index + semicolonPos + 1;
            console.log('  Breakpoint position: offset', breakpointCol);
            
            // 计算行号和列号
            // 动态代码是多行的
            var lineNum = dynCode.substring(0, funcMatch.index).split('\n').length - 1;
            var lineStart = 0;
            var currentLine = 0;
            for (var i = 0; i < dynCode.length; i++) {
              if (currentLine === lineNum) { lineStart = i; break; }
              if (dynCode[i] === '\n') currentLine++;
            }
            // 需要找到正确的行
            // 实际上 breakpointCol 是在整个代码中的偏移
            // 需要转换为行号和列号
            var bpLine = 0;
            var bpCol = 0;
            for (var i = 0; i < breakpointCol; i++) {
              if (dynCode[i] === '\n') { bpLine++; bpCol = 0; }
              else bpCol++;
            }
            
            console.log('  Breakpoint at line', bpLine, 'col', bpCol);
            
            // 设置断点
            // 动态代码的 startLine 可能不是 0
            var actualLine = bpLine; // + evalScripts[0].startLine;
            console.log('  Actual line (with startLine):', actualLine);
            
            // 尝试设置断点
            try {
              var bp = await client.send('Debugger.setBreakpoint', {
                location: {
                  scriptId: dynScriptId,
                  lineNumber: actualLine,
                  columnNumber: bpCol,
                },
              });
              console.log('  Breakpoint result:', JSON.stringify(bp));
              
              // 设置暂停处理
              var pausedResolver;
              var pausedPromise = new Promise(function(resolve) { pausedResolver = resolve; });
              
              client.on('Debugger.paused', async function(params) {
                console.log('\n  ★★★ Debugger paused!');
                console.log('  Call frames:', params.callFrames.length);
                
                for (var fi = 0; fi < Math.min(params.callFrames.length, 5); fi++) {
                  var frame = params.callFrames[fi];
                  console.log('\n  [Frame ' + fi + '] ' + (frame.functionName || '(anon)') + 
                    ' at ' + frame.location.scriptId + ':' + frame.location.lineNumber + ':' + frame.location.columnNumber);
                  
                  // 获取 scope 变量
                  if (frame.scopeChain) {
                    for (var si = 0; si < frame.scopeChain.length; si++) {
                      var scope = frame.scopeChain[si];
                      if (scope.object && scope.object.objectId) {
                        try {
                          var scopeProps = await client.send('Runtime.getProperties', {
                            objectId: scope.object.objectId,
                            ownProperties: true,
                            generatePreview: true,
                          });
                          
                          var interestingVars = scopeProps.result.filter(function(v) {
                            return v.name.indexOf('_$') === 0 && v.value;
                          });
                          
                          if (interestingVars.length > 0) {
                            console.log('    Scope[' + si + '] (' + scope.type + '):');
                            interestingVars.forEach(function(v) {
                              var desc = v.value.description || String(v.value.value || '');
                              console.log('      ' + v.name + ': ' + v.value.type + ' = ' + String(desc).substring(0, 100));
                            });
                          }
                        } catch(e) {}
                      }
                    }
                  }
                }
                
                pausedResolver(params);
                await client.send('Debugger.resume');
              });

              // 触发 send
              console.log('\n  触发 send...');
              await client.send('Runtime.evaluate', {
                expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.send('{}'); } catch(e) {} 'done'; })()`,
              });

              // 等待暂停
              await Promise.race([
                pausedPromise,
                new Promise(function(_, reject) { setTimeout(function() { reject(new Error('pause timeout')); }, 10000); }),
              ]);

              // 移除断点
              if (bp.breakpointId) {
                await client.send('Debugger.removeBreakpoint', { breakpointId: bp.breakpointId });
              }

            } catch(e) {
              console.log('  Breakpoint error:', e.message);
            }
          }
        }
      }
    }
  }

  await page.waitForTimeout(1000);
  console.log('\n=== 完成 ===');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
