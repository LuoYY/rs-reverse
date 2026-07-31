/**
 * 16_dump_vm_stack.js
 *
 * 在 [165] 断点暂停时，dump VM dispatcher 帧的完整内容：
 *   - bytecode（_$iE）
 *   - VM 栈数组（_$kq, _$cI, _$dq, _$iW, _$_F）
 *   - 常量池（_$fM）、字符串表（_$dl）、global（_$kz）
 * 目的：反汇编明文拼装逻辑
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

// 递归获取 object 内容（数组/对象）
async function dumpValue(cdp, objId, depth, maxLen) {
  if (depth > 4) return 'MAXDEPTH';
  try {
    const props = await cdp.send('Runtime.getProperties', { objectId: objId, ownProperties: true, accessorPropertiesOnly: false });
    if (props.result && props.result.length > 0) {
      // 判断是否数组
      const isArray = props.result.length > 0 && props.result.every(p => /^\d+$/.test(p.name));
      if (isArray && props.result.length > 60) return 'arr[' + props.result.length + ']';
      const out = {};
      for (const p of props.result.slice(0, maxLen || 40)) {
        let v;
        if (p.value?.value !== undefined) v = p.value.value;
        else if (p.value?.objectId) v = await dumpValue(cdp, p.value.objectId, depth + 1, maxLen);
        else if (p.value?.description) v = p.value.description;
        else v = p.value?.type;
        out[p.name] = v;
      }
      return JSON.stringify(out).substring(0, 3000);
    }
    return 'empty';
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

  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
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

  // 断点
  const f165 = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return this[165]; }' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: f165.result.objectId });
  console.log('[3] 断点已设置');

  // 暂停时 dump VM 帧
  let hitCount = 0;
  cdp.on('Debugger.paused', async (params) => {
    hitCount++;
    const dump = { hit: hitCount, time: Date.now(), frames: [] };
    for (const frame of params.callFrames) {
      const f = { func: frame.functionName || '(anon)', loc: frame.location.lineNumber + 1 + ':' + (frame.location.columnNumber + 1), scopes: {} };
      for (const scope of frame.scopeChain) {
        if (scope.type === 'global' || scope.type === 'script' || !scope.object?.objectId) continue;
        const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
        for (const p of props.result) {
          if (p.value?.value !== undefined) f.scopes[p.name] = p.value.value;
          else if (p.value?.objectId) f.scopes[p.name] = await dumpValue(cdp, p.value.objectId, 0, 80);
          else f.scopes[p.name] = p.value?.type;
        }
      }
      dump.frames.push(f);
    }
    const fname = path.join(OUT, 'vmstack_hit' + hitCount + '_' + Date.now() + '.json');
    fs.writeFileSync(fname, JSON.stringify(dump, null, 2));
    console.log('  暂停 ' + hitCount + ' → 已保存 ' + fname);
    if (hitCount < 6) {
      await cdp.send('Debugger.resume').catch(() => {});
    } else {
      await cdp.send('Debugger.resume').catch(() => {});
    }
  });

  // 触发 POST
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await page.waitForTimeout(3000);
  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
