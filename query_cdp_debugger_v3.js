/**
 * query_cdp_debugger_v3.js — 精确提取 send hook 变量名并设断点
 *
 * 问题：send hook 源码被截断（400 字符限制）
 * 解决：获取完整源码后再提取
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP Debugger v3 — 精确断点 ===\n');

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

  var evalScripts = [];
  client.on('Debugger.scriptParsed', function(params) {
    if (!params.url && params.length > 100000) {
      evalScripts.push({ scriptId: params.scriptId, length: params.length, startLine: params.startLine });
    }
  });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 获取完整 send hook 源码
  var sendSrc = await client.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  var sendSource = sendSrc.result.value;
  console.log('\n[3] send hook 完整源码 (' + sendSource.length + ' chars):');
  console.log(sendSource);

  // 提取变量名（更宽松的正则）
  // 格式: ...XXX(YYY,0,YYY.ZZZ.length,WWW)...AAA=WWW[4],BBB=WWW[5]...
  var allCalls = [...sendSource.matchAll(/(_\$[a-zA-Z0-9]+)\(/g)];
  console.log('\n  函数调用:');
  allCalls.forEach(m => console.log('    ' + m[1] + ' at pos ' + m.index));

  // 找到 dispatcher 调用（包含 .length 的那个）
  var dispMatch = sendSource.match(/(_\$[a-zA-Z0-9]+)\((_\$[a-zA-Z0-9]+),0,(_\$[a-zA-Z0-9]+)\.(_\$[a-zA-Z0-9]+)\.length,(_\$[a-zA-Z0-9]+)\)/);
  console.log('\n  Dispatcher match:', dispMatch ? 'YES' : 'NO');
  if (dispMatch) {
    console.log('    fn:', dispMatch[1]);
    console.log('    config:', dispMatch[2]);
    console.log('    bytecode obj:', dispMatch[3]);
    console.log('    bytecode prop:', dispMatch[4]);
    console.log('    args:', dispMatch[5]);
  }

  // 找到 exit code / return value 赋值
  var exitMatch = sendSource.match(/(_\$[a-zA-Z0-9]+)=(_\$[a-zA-Z0-9]+)\[4\],(_$[a-zA-Z0-9]+)=(_\$[a-zA-Z0-9]+)\[5\]/);
  console.log('\n  Exit match:', exitMatch ? 'YES' : 'NO');
  if (exitMatch) {
    console.log('    exitCode:', exitMatch[1] + '=' + exitMatch[2] + '[4]');
    console.log('    retVal:', exitMatch[3] + '=' + exitMatch[4] + '[5]');
  }

  // 如果提取成功，在动态代码中设断点
  if (dispMatch && exitMatch) {
    var sendFuncName = sendSource.match(/function\s+(_\$[a-zA-Z0-9]+)/)[1];
    var dispatcherFn = dispMatch[1];
    var argsArr = exitMatch[2];
    
    console.log('\n[4] 在动态代码中搜索 send hook...');
    
    evalScripts.sort((a, b) => b.length - a.length);
    
    // 找到包含 send hook 的脚本
    for (var si = 0; si < evalScripts.length; si++) {
      var dynScriptId = evalScripts[si].scriptId;
      try {
        var dynSrc = await client.send('Debugger.getScriptSource', { scriptId: dynScriptId });
        var dynCode = dynSrc.scriptSource;
        
        // 搜索 send hook 函数定义
        var escapedName = sendFuncName.replace(/\$/g, '\\$');
        var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\(', 'g');
        var funcMatch = funcRegex.exec(dynCode);
        
        if (funcMatch) {
          console.log('  Found in scriptId=' + dynScriptId + ' at offset ' + funcMatch.index);
          
          // 在函数体中找到 dispatcher 调用后的位置
          var funcBody = dynCode.substring(funcMatch.index);
          var dispCallPos = funcBody.indexOf(dispatcherFn + '(');
          
          if (dispCallPos >= 0) {
            // 找到调用后的分号
            var semicolonPos = funcBody.indexOf(';', dispCallPos);
            if (semicolonPos >= 0) {
              // 断点位置 = 函数开始 + 分号位置 + 1
              var bpOffset = funcMatch.index + semicolonPos + 1;
              
              // 转换为行号和列号
              var bpLine = 0, bpCol = 0;
              for (var i = 0; i < bpOffset && i < dynCode.length; i++) {
                if (dynCode[i] === '\n') { bpLine++; bpCol = 0; }
                else bpCol++;
              }
              
              console.log('  Breakpoint at offset ' + bpOffset + ' → line ' + bpLine + ' col ' + bpCol);
              
              // 设置断点
              var bp = await client.send('Debugger.setBreakpoint', {
                location: {
                  scriptId: dynScriptId,
                  lineNumber: bpLine,
                  columnNumber: bpCol,
                },
              });
              console.log('  BP result:', JSON.stringify(bp));
              
              if (bp.actualLocation) {
                console.log('  Actual location:', JSON.stringify(bp.actualLocation));
              }

              // 设置暂停处理
              var pausedData = null;
              client.on('Debugger.paused', async function(params) {
                console.log('\n  ★★★ PAUSED!');
                console.log('  Frames:', params.callFrames.length);
                
                // 遍历 frames，提取变量
                for (var fi = 0; fi < Math.min(params.callFrames.length, 5); fi++) {
                  var frame = params.callFrames[fi];
                  console.log('\n  [Frame ' + fi + '] ' + (frame.functionName || '(anon)'));
                  
                  // 从 scope chain 提取变量
                  if (frame.scopeChain) {
                    for (var sci = 0; sci < frame.scopeChain.length; sci++) {
                      var scope = frame.scopeChain[sci];
                      if (!scope.object || !scope.object.objectId) continue;
                      if (scope.type !== 'local' && scope.type !== 'closure') continue;
                      
                      try {
                        var props = await client.send('Runtime.getProperties', {
                          objectId: scope.object.objectId,
                          ownProperties: true,
                        });
                        
                        var interesting = props.result.filter(function(v) {
                          return v.name.indexOf('_$') === 0 && v.value && v.value.type !== 'undefined';
                        });
                        
                        if (interesting.length > 0) {
                          console.log('    Scope[' + sci + '] (' + scope.type + '): ' + interesting.length + ' vars');
                          for (var vi = 0; vi < Math.min(interesting.length, 30); vi++) {
                            var v = interesting[vi];
                            var desc = '';
                            if (v.value) {
                              if (v.value.type === 'string') desc = '"' + String(v.value.value).substring(0, 80) + '"';
                              else if (v.value.type === 'number') desc = String(v.value.value);
                              else if (v.value.type === 'boolean') desc = String(v.value.value);
                              else if (v.value.type === 'function') desc = '[fn]';
                              else if (v.value.type === 'object') desc = v.value.description ? v.value.description.substring(0, 80) : '[obj]';
                              else desc = String(v.value.description || '').substring(0, 80);
                            }
                            console.log('      ' + v.name + ': ' + desc);
                          }
                        }
                      } catch(e) {}
                    }
                  }
                }
                
                pausedData = params;
                await client.send('Debugger.resume');
              });

              // 触发 send
              console.log('\n  触发 send...');
              await client.send('Runtime.evaluate', {
                expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.send('{}'); } catch(e) {} 'done'; })()`,
              });

              // 等待暂停
              await new Promise(r => setTimeout(r, 5000));

              // 移除断点
              if (bp.breakpointId) {
                await client.send('Debugger.removeBreakpoint', { breakpointId: bp.breakpointId });
              }
              
              break; // 只处理第一个找到的脚本
            }
          }
        }
      } catch(e) {}
    }
  }

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
