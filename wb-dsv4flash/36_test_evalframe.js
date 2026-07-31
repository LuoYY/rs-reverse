/**
 * 36_test_evalframe.js
 *
 * 测试 Debugger.evaluateOnCallFrame 是否可用（在 [165] 断点时于 VM 帧求值）
 * 若可用 → 可在浏览器中直接用真实闭包环境重放 VM 字节码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  console.log('[1] 加载 + reload...');
  await page.goto(TARGET, { timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));
  await page.reload({ timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 12000));

  // 定位 global
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
  const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId; }
  }

  const f165 = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return this[165]; }' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: f165.result.objectId });
  console.log('[2] 断点设置');

  cdp.on('Debugger.paused', async (params) => {
    console.log('[3] 暂停! frames=' + params.callFrames.length);
    const f1 = params.callFrames[1];
    console.log('  frame1:', f1.functionName, 'callFrameId:', f1.callFrameId ? '有' : '无');
    // 测试 evaluateOnCallFrame
    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f1.callFrameId,
        expression: '(function(){ try { return JSON.stringify({ pc: this._$_0, bcLen: this._$_k[2] ? "?" : "?" }); } catch(e) { return "ERR:" + e.message; } })()',
        returnByValue: true,
      });
      console.log('  evaluateOnCallFrame 结果:', JSON.stringify(r.result?.result || r).substring(0, 200));
    } catch (e) {
      console.log('  evaluateOnCallFrame 失败:', e.message.substring(0, 100));
    }
    // 测试读取 frame1 变量
    try {
      const r2 = await cdp.send('Debugger.evaluateOnCallFrame', {
        callFrameId: f1.callFrameId,
        expression: `Object.keys(this).join(',')`,
        returnByValue: true,
      });
      console.log('  this 键:', r2.result?.result?.value);
    } catch (e) {
      console.log('  this 键读取失败:', e.message.substring(0, 80));
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await new Promise(r => setTimeout(r, 3000));
  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 200000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
