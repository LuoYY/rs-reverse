/**
 * query_cdp_debugger_v4.js — 用更灵活的正则匹配 send hook 变量
 *
 * 问题：send hook 源码中 dispatcher 调用格式不匹配之前的正则
 * 实际格式: _$$4(_$b6,0,_$b6._$_P.length,_$bl)
 * 注意 _$_P 不是 _$XX 格式（只有 2 个字符）
 * 正则需要支持 _$$XX 和 _$XX 格式
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP Debugger v4 — 灵活正则 ===\n');

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

  // 获取 send hook 源码
  var sendSrc = await client.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  var sendSource = sendSrc.result.value;
  console.log('[3] send hook (' + sendSource.length + ' chars):');
  console.log(sendSource);

  // 用更灵活的正则
  // _$$XX 格式的变量名: _$$4, _$$z, _$$Z
  // _$XX 格式的变量名: _$b6, _$bl, _$bh
  // 通用正则: [_$]+[a-zA-Z0-9$]+
  
  // 找 dispatcher: XXX(YYY,0,YYY.ZZZ.length,WWW)
  // XXX = [_$]+[a-zA-Z0-9$]+
  // YYY = [_$]+[a-zA-Z0-9$]+
  // ZZZ = [_$]+[a-zA-Z0-9$]+  
  // WWW = [_$]+[a-zA-Z0-9$]+
  
  var dispPattern = /([_$$a-zA-Z0-9]+)\(([_$$a-zA-Z0-9]+),0,([_$$a-zA-Z0-9]+)\.([_$$a-zA-Z0-9]+)\.length,([_$$a-zA-Z0-9]+)\)/;
  var dispMatch = sendSource.match(dispPattern);
  
  console.log('\nDispatcher match:', dispMatch ? 'YES' : 'NO');
  if (dispMatch) {
    console.log('  fn:', dispMatch[1]);
    console.log('  config:', dispMatch[2]);
    console.log('  bytecode obj:', dispMatch[3]);
    console.log('  bytecode prop:', dispMatch[4]);
    console.log('  args:', dispMatch[5]);
  }
  
  // 找 exit code: XXX=YYY[4],ZZZ=YYY[5]
  var exitPattern = /([_$$a-zA-Z0-9]+)=([_$$a-zA-Z0-9]+)\[4\],([_$$a-zA-Z0-9]+)=([_$$a-zA-Z0-9]+)\[5\]/;
  var exitMatch = sendSource.match(exitPattern);
  
  console.log('\nExit match:', exitMatch ? 'YES' : 'NO');
  if (exitMatch) {
    console.log('  exitCode:', exitMatch[1] + '=' + exitMatch[2] + '[4]');
    console.log('  retVal:', exitMatch[3] + '=' + exitMatch[4] + '[5]');
  }

  // 提取函数名
  var sendFuncName = sendSource.match(/function\s+([_$$a-zA-Z0-9]+)/)[1];
  console.log('\nSend function name:', sendFuncName);

  if (dispMatch && exitMatch) {
    var dispatcherFn = dispMatch[1];
    var argsArrName = exitMatch[2];
    
    console.log('\n[4] 在动态代码中设断点...');
    
    evalScripts.sort((a, b) => b.length - a.length);
    
    for (var si = 0; si < evalScripts.length; si++) {
      var dynScriptId = evalScripts[si].scriptId;
      try {
        var dynSrc = await client.send('Debugger.getScriptSource', { scriptId: dynScriptId });
        var dynCode = dynSrc.scriptSource;
        
        var escapedName = sendFuncName.replace(/\$/g, '\\$');
        var funcRegex = new RegExp('function\\s+' + escapedName + '\\s*\\(', 'g');
        var funcMatch = funcRegex.exec(dynCode);
        
        if (funcMatch) {
          console.log('  Found in scriptId=' + dynScriptId + ' at offset ' + funcMatch.index);
          
          // 在函数体中找到 dispatcher 调用
          var escapedDisp = dispatcherFn.replace(/\$/g, '\\$');
          var dispRegex = new RegExp(escapedDisp + '\\(', 'g');
          var funcBody = dynCode.substring(funcMatch.index);
          var dispInBody = dispRegex.exec(funcBody);
          
          if (dispInBody) {
            var dispOffset = funcMatch.index + dispInBody.index;
            console.log('  Dispatcher call at offset', dispOffset);
            
            // 找到调用后的分号
            var semicolonRel = funcBody.indexOf(';', dispInBody.index);
            if (semicolonRel >= 0) {
              var bpOffset = funcMatch.index + semicolonRel + 1;
              
              // 转换为行号和列号
              var bpLine = 0, bpCol = 0;
              for (var i = 0; i < bpOffset; i++) {
                if (i < dynCode.length) {
                  if (dynCode[i] === '\n') { bpLine++; bpCol = 0; }
                  else bpCol++;
                }
              }
              
              console.log('  Breakpoint: line=' + bpLine + ' col=' + bpCol);
              
              // 设断点
              var bp = await client.send('Debugger.setBreakpoint', {
                location: {
                  scriptId: dynScriptId,
                  lineNumber: bpLine,
                  columnNumber: bpCol,
                },
              });
              console.log('  BP:', JSON.stringify(bp));
              
              if (bp.actualLocation) {
                console.log('  Actual:', bp.actualLocation.lineNumber + ':' + bp.actualLocation.columnNumber);
              }

              // 暂停处理
              client.on('Debugger.paused', async function(params) {
                console.log('\n  ★★★ PAUSED at send hook!');
                
                for (var fi = 0; fi < Math.min(params.callFrames.length, 3); fi++) {
                  var frame = params.callFrames[fi];
                  console.log('\n  [Frame ' + fi + '] ' + (frame.functionName || '(anon)'));
                  
                  // 提取 scope 变量
                  if (frame.scopeChain) {
                    for (var sci = 0; sci < frame.scopeChain.length; sci++) {
                      var scope = frame.scopeChain[sci];
                      if (!scope.object || !scope.object.objectId) continue;
                      
                      try {
                        var props = await client.send('Runtime.getProperties', {
                          objectId: scope.object.objectId,
                          ownProperties: true,
                        });
                        
                        var interesting = props.result.filter(function(v) {
                          return v.value && v.value.type !== 'undefined' && v.name !== 'this';
                        });
                        
                        if (interesting.length > 0) {
                          console.log('    Scope[' + sci + '] (' + scope.type + '):');
                          for (var vi = 0; vi < Math.min(interesting.length, 20); vi++) {
                            var v = interesting[vi];
                            var desc = '';
                            if (v.value.type === 'string') desc = '"' + String(v.value.value).substring(0, 100) + '"';
                            else if (v.value.type === 'number') desc = String(v.value.value);
                            else if (v.value.type === 'boolean') desc = String(v.value.value);
                            else if (v.value.type === 'function') desc = '[fn:' + (v.value.description || '').substring(0, 60) + ']';
                            else if (v.value.type === 'object') {
                              desc = v.value.description ? v.value.description.substring(0, 100) : '[obj]';
                              // 如果是数组，尝试获取内容
                              if (desc.indexOf('Array') >= 0 && v.value.objectId) {
                                try {
                                  var arrProps = await client.send('Runtime.getProperties', {
                                    objectId: v.value.objectId,
                                    ownProperties: true,
                                  });
                                  var arrData = [];
                                  for (var ai = 0; ai < Math.min(arrProps.result.length, 20); ai++) {
                                    var elem = arrProps.result[ai];
                                    if (elem.value) {
                                      if (elem.value.type === 'number') arrData.push(elem.value.value);
                                      else if (elem.value.type === 'string') arrData.push('"' + String(elem.value.value).substring(0, 30) + '"');
                                      else arrData.push('[' + elem.value.type + ']');
                                    }
                                  }
                                  desc += ' {' + arrData.join(',') + '}';
                                } catch(e) {}
                              }
                            }
                            else desc = String(v.value.description || v.value.value || '').substring(0, 100);
                            console.log('      ' + v.name + ': ' + desc);
                          }
                        }
                      } catch(e) {}
                    }
                  }
                }
                
                await client.send('Debugger.resume');
                console.log('\n  Resumed.');
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
              
              break;
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
