/**
 * 19_hook_vm_entries.js
 * 
 * Hook global 数组中的 VM 入口点函数
 * 追踪 query 生成时调用了哪些 VM 子程序
 * 
 * VM 入口点模式：
 * function _$xx(){var _$bN=[N];Array.prototype.push.apply(_$bN,arguments);return _$$0.apply(this,_$bN);}
 * N = 子程序编号
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  
  console.log('[1] 加载...');
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  const tv = await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  console.log('[2] 验证:', tv.result.value);
  
  // 获取 global 数组
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  
  const dSrcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32[1];
  
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId;
    }
  }
  
  console.log('[3] Global 数组已定位');
  
  // [4] Hook 所有 VM 入口点函数
  console.log('\n[4] Hook VM 入口点...');
  
  const hookResult = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var self = this;
      var hooked = [];
      var callLog = [];
      
      // 存储 log 到数组上
      this.__callLog = callLog;
      
      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] !== 'function') continue;
        var src = Function.prototype.toString.call(this[i]);
        
        // 检测 VM 入口点模式: var _$bN=[N];...push.apply...return _$$0.apply
        var m = src.match(/\\[([0-9]+)\\]/);
        if (m && src.includes('push.apply') && src.includes('.apply(this')) {
          var subNum = parseInt(m[1]);
          (function(idx, subNum, orig) {
            self[idx] = function() {
              var args = Array.from(arguments);
              var argInfo = args.map(function(a) {
                if (Array.isArray(a)) return 'arr[' + a.length + ']';
                if (typeof a === 'string') return '"' + a.substring(0, 20) + '"';
                if (typeof a === 'number') return '' + a;
                if (typeof a === 'object' && a) return 'obj';
                return typeof a;
              });
              callLog.push({
                sub: subNum,
                idx: idx,
                args: argInfo,
                // 捕获数组参数的内容（前 20 个元素）
                arrayArgs: args.map(function(a) {
                  return Array.isArray(a) ? a.slice(0, 20) : null;
                }),
                time: Date.now(),
              });
              var result = orig.apply(this, arguments);
              // 记录返回值
              var lastLog = callLog[callLog.length - 1];
              if (Array.isArray(result)) {
                lastLog.resultType = 'arr[' + result.length + ']';
                lastLog.resultPreview = result.slice(0, 20);
              } else if (typeof result === 'string') {
                lastLog.resultType = 'string(' + result.length + ')';
                lastLog.resultPreview = result.substring(0, 50);
              } else {
                lastLog.resultType = typeof result;
              }
              return result;
            };
          })(i, subNum, this[i]);
          hooked.push({idx: i, sub: subNum});
        }
      }
      
      return JSON.stringify({hooked: hooked.length, entries: hooked});
    }`,
    returnByValue: true,
  });
  
  const hookInfo = JSON.parse(hookResult.result.value);
  console.log(`  Hooked ${hookInfo.hooked} VM 入口点`);
  console.log('  子程序编号:', hookInfo.entries.map(e => e.sub).join(', '));
  
  // [5] 也 hook encryptMode1 函数（[165] 和 [151]）
  console.log('\n[5] Hook 加密函数...');
  const encHookResult = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var self = this;
      var encLog = [];
      this.__encLog = encLog;
      
      // Hook 所有可能是 encryptMode1/2 的函数
      // 特征：调用 _$bQ (getCfg) 然后调用 ._ 方法
      var candidates = [151, 165]; // 已识别的加密函数索引
      for (var ci = 0; ci < candidates.length; ci++) {
        var idx = candidates[ci];
        if (typeof this[idx] === 'function') {
          (function(idx, orig) {
            self[idx] = function() {
              var args = Array.from(arguments);
              var logEntry = {
                idx: idx,
                time: Date.now(),
                argTypes: args.map(function(a) {
                  if (Array.isArray(a)) return 'arr[' + a.length + ']';
                  return typeof a;
                }),
              };
              // 捕获 key（第二个参数）
              if (args[1] && Array.isArray(args[1])) {
                logEntry.key = args[1].slice(0, 32);
                logEntry.keyLen = args[1].length;
              }
              // 捕获 data（第一个参数）
              if (args[0] && Array.isArray(args[0])) {
                logEntry.dataLen = args[0].length;
                logEntry.dataPreview = args[0].slice(0, 20);
              }
              // flag 和 random
              logEntry.flag = args[2];
              logEntry.random = args[3];
              
              var result = orig.apply(this, arguments);
              
              if (Array.isArray(result)) {
                logEntry.resultLen = result.length;
                logEntry.resultPreview = result.slice(0, 20);
              }
              encLog.push(logEntry);
              return result;
            };
          })(idx, this[idx]);
          console.log('  Hooked encrypt function at [' + idx + ']');
        }
      }
      
      return JSON.stringify({hooked: candidates.length});
    }`,
    returnByValue: true,
  });
  console.log('  加密函数 hook:', encHookResult.result.value);
  
  // [6] 触发 POST 请求
  console.log('\n[6] 触发 POST...');
  const postRes = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var x = new XMLHttpRequest();
      x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
      x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      x.send('{}');
      return x.status + ' ' + (x.responseURL || '').substring(0, 120);
    })()`,
    returnByValue: true,
  });
  console.log('  POST:', postRes.result.value);
  
  // [7] 读取 hook 日志
  console.log('\n[7] VM 调用日志:');
  const callLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function() { return JSON.stringify(this.__callLog || []); }',
    returnByValue: true,
  });
  const callLog = JSON.parse(callLogR.result.value);
  console.log(`  总共 ${callLog.length} 次 VM 调用:`);
  for (const entry of callLog) {
    console.log(`  sub=${entry.sub} idx=${entry.idx} args=[${entry.args.join(', ')}] → ${entry.resultType || '?'}`);
    if (entry.resultPreview && entry.resultType && entry.resultType.startsWith('arr')) {
      console.log(`    result: [${entry.resultPreview.join(',')}]`);
    }
    if (entry.resultPreview && entry.resultType && entry.resultType.startsWith('string')) {
      console.log(`    result: "${entry.resultPreview}"`);
    }
  }
  
  console.log('\n[8] 加密函数日志:');
  const encLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function() { return JSON.stringify(this.__encLog || []); }',
    returnByValue: true,
  });
  const encLog = JSON.parse(encLogR.result.value);
  console.log(`  总共 ${encLog.length} 次加密调用:`);
  for (const entry of encLog) {
    console.log(`  [${entry.idx}] flag=${entry.flag} keyLen=${entry.keyLen} dataLen=${entry.dataLen} → resultLen=${entry.resultLen}`);
    if (entry.key) console.log(`    KEY: [${entry.key.join(',')}]`);
    if (entry.dataPreview) console.log(`    DATA: [${entry.dataPreview.join(',')}]`);
    if (entry.resultPreview) console.log(`    RESULT: [${entry.resultPreview.join(',')}]`);
  }
  
  // 保存
  fs.writeFileSync(path.join(OUT, 'vm_call_log.json'), JSON.stringify({ callLog, encLog }, null, 2));
  console.log('\n[9] 保存到 captures/vm_call_log.json');
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
