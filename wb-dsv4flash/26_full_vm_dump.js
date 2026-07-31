/**
 * 26_full_vm_dump.js
 *
 * 在 [165] 断点时：
 *   1. 完整 dump 所有帧变量（不截断）
 *   2. 对 frame 1 所有数组测试 XOR keys2 → prefix（掩码来源）
 *   3. 反汇编当前子程序字节码
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

async function dumpValue(cdp, objId, depth, maxArr) {
  if (depth > 4) return 'MAXDEPTH';
  try {
    const props = await cdp.send('Runtime.getProperties', { objectId: objId, ownProperties: true });
    if (!props.result || !props.result.length) return 'empty';
    const numIdx = props.result.filter(p => /^\d+$/.test(p.name));
    if (numIdx.length > 2) {
      // 数组
      const elems = numIdx.slice(0, maxArr || 500).map(p => p.value?.value);
      if (elems.every(e => typeof e === 'number')) return { t: 'arr', len: elems.length, d: elems };
      return { t: 'arr-mixed', len: numIdx.length, desc: 'arr' };
    }
    const out = {};
    for (const p of props.result.slice(0, 40)) {
      if (p.value?.value !== undefined) out[p.name] = p.value.value;
      else if (p.value?.objectId) out[p.name] = await dumpValue(cdp, p.value.objectId, depth + 1, maxArr);
      else if (p.value?.description) out[p.name] = p.value.description.substring(0, 80);
      else out[p.name] = p.value?.type;
    }
    return out;
  } catch (e) { return 'ERR'; }
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('[1] 启动...');
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

  // [165] 断点
  const f165 = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return this[165]; }' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: f165.result.objectId });
  console.log('[3] 断点设置');

  let hit = 0;
  cdp.on('Debugger.paused', async (params) => {
    hit++;
    const dump = { hit, time: Date.now(), frames: [] };
    for (const frame of params.callFrames) {
      const f = { func: frame.functionName || '(anon)', loc: frame.location.lineNumber + 1 + ':' + (frame.location.columnNumber + 1), vars: {} };
      for (const scope of frame.scopeChain) {
        if (scope.type === 'global' || scope.type === 'script' || !scope.object?.objectId) continue;
        const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
        for (const p of props.result) {
          if (p.value?.value !== undefined) f.vars[p.name] = p.value.value;
          else if (p.value?.objectId) f.vars[p.name] = await dumpValue(cdp, p.value.objectId, 0, 500);
          else f.vars[p.name] = p.value?.type;
        }
      }
      dump.frames.push(f);
    }
    const fname = path.join(OUT, 'vmfull_hit' + hit + '_' + Date.now() + '.json');
    fs.writeFileSync(fname, JSON.stringify(dump, null, 2));
    console.log('  暂停 ' + hit + ' → 已保存（frames=' + dump.frames.length + '）');
    if (hit < 6) await cdp.send('Debugger.resume').catch(() => {});
    else await cdp.send('Debugger.resume').catch(() => {});
  });

  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await page.waitForTimeout(4000);
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
