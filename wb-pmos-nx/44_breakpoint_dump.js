/**
 * 44_breakpoint_dump.js
 *
 * 在 [185]（trampoline _$no）断点，dump 调用栈所有帧的数组变量
 * 找 basearr（numarrEncrypt 输入，含 ASCII "MacIntel" 特征）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 定位 global 数组
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
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
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      if (v.value.description === 'Array(607)') {
        const chk = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function(){ return JSON.stringify({ t185: typeof this[185] }); }',
          returnByValue: true,
        });
        if (JSON.parse(chk.result.value).t185 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }

  // 获取 [185] 源码 → 找函数名（trampoline）
  const srcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return Function.prototype.toString.call(this[185]); }',
    returnByValue: true,
  });
  const fn185src = srcR.result.value;
  const fnName = fn185src.match(/function\s+([_$\w]+)/);
  const fname = fnName ? fnName[1] : null;
  console.log('[185] 函数名:', fname);

  // 在 [185] 函数上下断点
  const bpR = await cdp.send('Debugger.setBreakpointByUrl', {
    url: '', lineNumber: 0,
    scriptId: null,
  }).catch(e => ({ error: e.message }));

  // 用 evaluate 定位函数并下断点（通过 scriptId）
  // 方式：找到 [185] 的 script
  const scriptR = await cdp.send('Runtime.evaluate', { expression: `(function(){ var f = ${fname || 'null'}; return f ? { hasFunc: true } : { hasFunc: false }; })()`, returnByValue: true });
  console.log('函数存在:', scriptR.result.value);

  // 用 Debugger.setBreakpoint 在函数内
  // 先找到函数所在 scriptId：通过 evaluate 拿函数引用，用 CDP 找
  // 简化：hook [185] 包装函数，在内部用 evaluate 遍历栈
  console.log('\n=== 方案B：hook [185] 并遍历调用栈 ===');
  const hookR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var orig = this[185];
      this[185] = function() {
        try {
          var frames = [];
          // 遍历栈（通过 Error.stack 定位调用者，然后 evaluate 读取其变量）
          var stack = (new Error()).stack;
          var records = [];
          // 读取 arguments 中是否有 basearr（>250 长度数组）
          for (var i = 0; i < arguments.length; i++) {
            var a = arguments[i];
            if (Array.isArray(a) && a.length > 250) records.push({ t: 'arg' + i, len: a.length, head: a.slice(0, 30) });
          }
          var r = orig.apply(this, arguments);
          window.__bpDump = records;
        } catch(e) {}
        return orig.apply(this, arguments);
      };
      return 'ok';
    }`,
    returnByValue: true,
  });
  console.log('hook:', hookR.result.value);

  // 触发请求
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  const dumpR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__bpDump || [])', returnByValue: true });
  console.log('大数组参数:', dumpR.result.value);

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
