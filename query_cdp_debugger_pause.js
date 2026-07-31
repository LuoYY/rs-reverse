/**
 * query_cdp_debugger_pause.js — CDP Debugger.pause 在 send 执行时暂停
 *
 * 之前 setBreakpointOnFunctionCall 失败因为 Debugger 未启用
 * 这次先启用 Debugger
 *
 * 策略：
 * 1. 启用 Debugger
 * 2. 在 send hook 的 VM dispatcher 调用后设条件断点
 * 3. 当 send 被调用时暂停
 * 4. dump call frame 中的所有变量
 * 5. 找到 query 值和加密密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== CDP Debugger.pause 提取 query 生成变量 ===\n');

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
      evalScripts.push({ scriptId: params.scriptId, length: params.length });
    }
  });

  // 监听网络
  var queryCount = 0;
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0) queryCount++;
  });

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 获取 send 函数 objectId
  console.log('\n[3] 获取 send 函数...');
  var sendEval = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
  });
  console.log('  send objectId:', sendEval.result.objectId);

  // 设置 Debugger.setBreakpointOnFunctionCall
  console.log('\n[4] 设置函数调用断点...');
  
  var pausedHandler = null;
  var pausePromise = new Promise(function(resolve) {
    pausedHandler = function(params) {
      resolve(params);
    };
    client.on('Debugger.paused', pausedHandler);
  });

  try {
    var bpResult = await client.send('Debugger.setBreakpointOnFunctionCall', {
      objectId: sendEval.result.objectId,
    });
    console.log('  Breakpoint:', JSON.stringify(bpResult));

    // 在另一个上下文中触发 send
    console.log('\n[5] 触发 send（异步）...');
    
    // 不等待结果，让它在后台执行
    client.send('Runtime.evaluate', {
      expression: `(function(){ try { var xhr = new XMLHttpRequest(); xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); xhr.send('{}'); } catch(e) {} })()`,
    }).catch(() => {});

    // 等待暂停
    console.log('  等待 Debugger.pause...');
    var pausedParams = await Promise.race([
      pausePromise,
      new Promise(function(_, reject) { setTimeout(function() { reject(new Error('timeout')); }, 10000); }),
    ]);

    console.log('  ★ Debugger paused!');
    console.log('  Call frames:', pausedParams.callFrames.length);

    // 遍历 call frames
    for (var fi = 0; fi < Math.min(pausedParams.callFrames.length, 10); fi++) {
      var frame = pausedParams.callFrames[fi];
      console.log('\n  [Frame ' + fi + '] ' + (frame.functionName || '(anonymous)') + 
        ' at script:' + frame.location.scriptId + ':' + frame.location.lineNumber + ':' + frame.location.columnNumber);

      // 获取 this 和 arguments
      try {
        var frameData = await client.send('Runtime.evaluateOnCallFrame', {
          callFrameId: frame.callFrameId,
          expression: `(function(){
            var result = {};
            result.argCount = arguments.length;
            if (arguments.length > 0) {
              result.arg0Type = typeof arguments[0];
              result.arg0Val = String(arguments[0]).substring(0, 200);
            }
            result.thisType = typeof this;
            try { result.thisKeys = Object.getOwnPropertyNames(this).filter(function(k){return k.indexOf('_$')===0;}).slice(0,10).join(','); } catch(e) {}
            return JSON.stringify(result);
          }).call(this)`,
          returnByValue: true,
        });
        console.log('    Data:', frameData.result.value);
      } catch(e) {
        console.log('    Eval error:', e.message);
      }

      // 尝试获取 VM 变量
      try {
        var vmVars = await client.send('Runtime.evaluateOnCallFrame', {
          callFrameId: frame.callFrameId,
          expression: `(function(){
            var result = {};
            // 尝试获取常见的 VM 变量名
            var names = ['_$fZ', '_$ii', '_$$b', '_$ip', '_$bT', '_$_Z', '_$du', '_$_4', '_$e1', '_$$I'];
            for (var i = 0; i < names.length; i++) {
              try {
                var v = eval(names[i]);
                if (v !== undefined) {
                  result[names[i]] = { type: typeof v, val: String(v).substring(0, 200) };
                }
              } catch(e) {}
            }
            return JSON.stringify(result);
          })()`,
          returnByValue: true,
        });
        if (vmVars.result.value !== '{}') {
          console.log('    VM vars:', vmVars.result.value);
        }
      } catch(e) {}

      // 获取 scope chain
      if (frame.scopeChain && frame.scopeChain.length > 0) {
        for (var si = 0; si < Math.min(frame.scopeChain.length, 3); si++) {
          var scope = frame.scopeChain[si];
          if (scope.type === 'local' || scope.type === 'closure') {
            try {
              var scopeVars = await client.send('Runtime.evaluateOnCallFrame', {
                callFrameId: frame.callFrameId,
                expression: `(function(){
                  var result = {};
                  // 列出所有 _$ 开头的变量
                  try {
                    var code = '';
                    // 不能动态枚举局部变量，只能尝试已知名称
                  } catch(e) {}
                  return JSON.stringify(result);
                })()`,
                returnByValue: true,
              });
            } catch(e) {}
          }
        }
      }
    }

    // 恢复执行
    await client.send('Debugger.resume');
    console.log('\n  Resumed.');

  } catch(e) {
    console.log('  Error:', e.message);
    // 确保恢复
    try { await client.send('Debugger.resume'); } catch(e) {}
  }

  // 移除断点
  if (bpResult && bpResult.breakpointId) {
    try { await client.send('Debugger.removeBreakpoint', { breakpointId: bpResult.breakpointId }); } catch(e) {}
  }

  // 等待请求完成
  await page.waitForTimeout(2000);

  console.log('\n=== 总结 ===');
  console.log('Query requests captured:', queryCount);

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
