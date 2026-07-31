/**
 * 09_breakpoint_encrypt.js
 *
 * 在 [165] 加密函数上设断点，暂停后 dump 调用者 callFrame 的作用域变量
 * 目的：找到 24B 明文的拼装来源（前缀/时间/计数器的生成代码）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // ---- 定位 global 数组 ----
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
  const dSrc = dSrcR.result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  if (!globalName) { console.log('❌ global not found'); await browser.close(); return; }
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
  if (!globalId) { console.log('❌ global array not found'); await browser.close(); return; }

  // ---- 在 [165] 上设断点 ----
  console.log('\n[3] 获取 [165] 函数 objectId...');
  const f165 = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return this[165]; }',
  });
  console.log('  [165] type:', f165.result?.type, 'desc:', f165.result?.description?.substring(0, 60));

  const bp = await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: f165.result.objectId });
  console.log('  断点已设置:', JSON.stringify(bp));

  // 触发 POST（异步，因为断点会暂停）
  console.log('\n[4] 触发 POST（将命中断点）...');
  const triggers = [
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{}' },
  ];

  let framesDumped = 0;
  const dumpAll = [];

  cdp.on('Debugger.paused', async (params) => {
    framesDumped++;
    const entry = { reason: params.reason, frames: [] };
    for (const frame of params.callFrames) {
      const f = { func: frame.functionName || '(anon)', location: (frame.location.lineNumber + 1) + ':' + (frame.location.columnNumber + 1), scopeVars: {} };
      for (const scope of frame.scopeChain) {
        if (scope.type === 'global' || scope.type === 'script') continue;
        if (!scope.object.objectId) continue;
        try {
          const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
          for (const p of props.result) {
            let v;
            if (p.value?.value !== undefined) v = p.value.value;
            else if (p.value?.type === 'object' && p.value?.description) v = p.value.description;
            else if (p.value?.type === 'string') v = p.value.value;
            else v = p.value?.type;
            f.scopeVars[p.name] = typeof v === 'object' ? JSON.stringify(v) : v;
          }
        } catch (e) {}
      }
      entry.frames.push(f);
    }
    dumpAll.push(entry);
    console.log('  ★ 暂停 ' + framesDumped + '，frames=' + params.callFrames.length);
    if (framesDumped >= 3) {
      await cdp.send('Debugger.resume').catch(() => {});
    } else {
      await cdp.send('Debugger.resume').catch(() => {});
    }
  });

  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      try {
        var x = new XMLHttpRequest();
        x.open('${triggers[0].m}', '${triggers[0].u}', false);
        x.setRequestHeader('Content-Type', 'application/json');
        x.send('${triggers[0].b}');
        return JSON.stringify({ status: x.status });
      } catch(e) { return e.message; }
    })()`,
    returnByValue: true,
  });
  console.log('  结果:', trig.result.value);

  await page.waitForTimeout(2000);

  // 保存 dump
  const fname = path.join(OUT, 'bp_dump_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(dumpAll, null, 2));

  // 打印最内层 callFrame（加密函数的调用者）
  console.log('\n=== 调用栈（最内层在前）===');
  if (dumpAll[0]) {
    for (const f of dumpAll[0].frames) {
      console.log('  [frame]', f.func, '@', f.location);
      const keys = Object.keys(f.scopeVars);
      console.log('    vars:', keys.length);
      for (const k of keys.slice(0, 25)) {
        const v = String(f.scopeVars[k]).substring(0, 120);
        console.log('      ' + k + ' = ' + v);
      }
    }
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
