/**
 * 20_full_capture.js
 * 
 * 完整捕获 query 加密的明文/密文/密钥
 * 修改 hook 以捕获完整数组（不截断）
 * 同时捕获 session_data 的生成过程
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
  
  // 在页面加载前注入 hook（通过 addInitScript）
  // 不行，因为 RS 在 eval 中运行，hook 需要在 RS 初始化后设置
  
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
  
  // [4] Hook 加密函数（完整捕获）
  console.log('\n[4] Hook 加密函数（完整数组）...');
  
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var self = this;
      this.__encLogFull = [];
      
      // Hook [165] 和 [151]（encryptMode1/2）
      [151, 165].forEach(function(idx) {
        if (typeof self[idx] !== 'function') return;
        var orig = self[idx];
        self[idx] = function() {
          var args = Array.from(arguments);
          var entry = {
            idx: idx,
            time: Date.now(),
            // 完整捕获所有数组参数
            data: args[0] && Array.isArray(args[0]) ? Array.from(args[0]) : null,
            key: args[1] && Array.isArray(args[1]) ? Array.from(args[1]) : null,
            flag: args[2],
            random: args[3],
          };
          var result = orig.apply(this, arguments);
          entry.result = result && Array.isArray(result) ? Array.from(result) : null;
          self.__encLogFull.push(entry);
          return result;
        };
      });
      
      // 也 hook CRC32 函数 [78]
      if (typeof self[78] === 'function') {
        var origCrc = self[78];
        self.__crcLog = [];
        self[78] = function() {
          var args = Array.from(arguments);
          var result = origCrc.apply(this, arguments);
          self.__crcLog.push({
            input: args[0] && Array.isArray(args[0]) ? args[0].length : typeof args[0],
            inputPreview: args[0] && Array.isArray(args[0]) ? Array.from(args[0]).slice(0, 10) : null,
            result: result,
          });
          return result;
        };
      }
      
      // Hook numarr2string [213]
      if (typeof self[213] === 'function') {
        var origN2s = self[213];
        self.__n2sLog = [];
        self[213] = function() {
          var args = Array.from(arguments);
          var result = origN2s.apply(this, arguments);
          self.__n2sLog.push({
            inputLen: args[0] && Array.isArray(args[0]) ? args[0].length : null,
            input: args[0] && Array.isArray(args[0]) ? Array.from(args[0]) : null,
            result: typeof result === 'string' ? result : null,
          });
          return result;
        };
      }
      
      // Hook numarrJoin 相关函数
      // [83] _$_K: push single byte
      // [88] _$jB: push array
      // [75] _$hX: push uint32 as 4 bytes
      // [177] _$cY: push with division
      
      return 'hooked';
    }`,
    returnByValue: true,
  });
  console.log('  加密 + CRC32 + numarr2string hook 完成');
  
  // [5] 触发多个请求
  console.log('\n[5] 触发请求...');
  
  // GET 请求
  await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  
  // POST 请求
  await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("POST","/px-gateway/GatewayConfig/getGatewayConfig",false);x.setRequestHeader("Content-Type","application/json;charset=UTF-8");x.send("{}");return x.status})()',
    returnByValue: true,
  });
  
  // 另一个 POST
  await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("POST","/px-common-authcenter/auth/v2/captcha/get",false);x.send("{}");return x.status})()',
    returnByValue: true,
  });
  
  console.log('  3 个请求完成');
  
  // [6] 读取完整日志
  console.log('\n[6] 加密日志:');
  const encLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function() { return JSON.stringify(this.__encLogFull || []); }',
    returnByValue: true,
  });
  const encLog = JSON.parse(encLogR.result.value);
  
  for (let i = 0; i < encLog.length; i++) {
    const e = encLog[i];
    console.log(`\n  调用 ${i}: [${e.idx}] flag=${e.flag}`);
    console.log(`    key (${e.key?.length}B): [${e.key?.join(',')}]`);
    console.log(`    data (${e.data?.length}B): [${e.data?.slice(0, 30).join(',')}${e.data?.length > 30 ? ',...' : ''}]`);
    console.log(`    result (${e.result?.length}B): [${e.result?.slice(0, 30).join(',')}${e.result?.length > 30 ? ',...' : ''}]`);
  }
  
  // [7] CRC32 日志
  console.log('\n[7] CRC32 日志:');
  const crcLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function() { return JSON.stringify(this.__crcLog || []); }',
    returnByValue: true,
  });
  const crcLog = JSON.parse(crcLogR.result.value);
  for (const c of crcLog) {
    console.log(`  input: ${c.input}B → CRC32 = ${c.result} (0x${(c.result >>> 0).toString(16)})`);
  }
  
  // [8] numarr2string 日志
  console.log('\n[8] numarr2string 日志:');
  const n2sLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function() { return JSON.stringify(this.__n2sLog || []); }',
    returnByValue: true,
  });
  const n2sLog = JSON.parse(n2sLogR.result.value);
  for (const n of n2sLog) {
    console.log(`  input: ${n.inputLen}B → "${n.result?.substring(0, 60)}..." (${n.result?.length} chars)`);
    if (n.input && n.inputLen <= 100) {
      console.log(`  完整输入: [${n.input.join(',')}]`);
    }
  }
  
  // 保存完整数据
  fs.writeFileSync(path.join(OUT, 'full_capture.json'), JSON.stringify({ encLog, crcLog, n2sLog }, null, 2));
  console.log('\n[9] 保存到 captures/full_capture.json');
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
