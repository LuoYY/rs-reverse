/**
 * 45_dump_vmctx_arrays.js
 *
 * 纯 getProperties：完整 dump frame1 VM 上下文的所有数组属性（字节码段）
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

async function getArr(cdp, objId, max) {
  const props = await cdp.send('Runtime.getProperties', { objectId: objId, ownProperties: true });
  return props.result.filter(x => /^\d+$/.test(x.name)).slice(0, max || 500).map(x => x.value?.value);
}

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

  let done = false;
  cdp.on('Debugger.paused', async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    const f0 = params.callFrames[0];
    if (!f0) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    // 检查 query 加密
    let isQuery = false;
    for (const scope of f0.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (p.value?.objectId) {
          try {
            const elems = await getArr(cdp, p.value.objectId, 30);
            if (elems.length === 24 && elems.every(e => typeof e === 'number')) { isQuery = true; break; }
          } catch (e) {}
        }
      }
      if (isQuery) break;
    }
    if (!isQuery) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    done = true;
    console.log('[3] ★ query 加密命中');

    const f1 = params.callFrames[1];
    if (!f1) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    // 找 frame1 的 VM 上下文（含 206 数组的对象）
    let vmCtxObjId = null;
    for (const scope of f1.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (!p.value?.objectId || p.value.description?.includes('Window')) continue;
        try {
          const p2 = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          for (const pp of p2.result) {
            if (pp.value?.description && /Array\(20\d\)/.test(pp.value.description)) { vmCtxObjId = p.value.objectId; break; }
          }
        } catch (e) {}
        if (vmCtxObjId) break;
      }
      if (vmCtxObjId) break;
    }
    if (!vmCtxObjId) { console.log('  未找到 VM 上下文'); await cdp.send('Debugger.resume').catch(() => {}); return; }

    // dump VM 上下文所有属性
    const ctxProps = await cdp.send('Runtime.getProperties', { objectId: vmCtxObjId, ownProperties: true });
    const dump = { time: Date.now(), vmCtx: {} };
    for (const p of ctxProps.result) {
      if (p.value?.objectId) {
        try {
          const elems = await getArr(cdp, p.value.objectId, 400);
          if (elems.length > 3) dump.vmCtx[p.name] = elems;
          else dump.vmCtx[p.name] = { type: 'obj' };
        } catch (e) { dump.vmCtx[p.name] = 'ERR'; }
      } else if (p.value?.value !== undefined) dump.vmCtx[p.name] = p.value.value;
      else dump.vmCtx[p.name] = p.value?.type;
    }
    const fname = path.join(OUT, 'vmctx_full_' + Date.now() + '.json');
    fs.writeFileSync(fname, JSON.stringify(dump));
    console.log('  已保存:', fname);
    await cdp.send('Debugger.resume').catch(() => {});
  });

  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await new Promise(r => setTimeout(r, 4000));
  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 200000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
