/**
 * 46_get_dispatcher_bytecode.js
 *
 * 获取构造 plain24 的子程序字节码：
 *   global[103](trampoline) → _$fy(dispatcher) → 闭包字节码池（子程序 @186）
 * 在 [165] 断点时通过 CDP 遍历闭包提取
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

  // 获取 global[103] 的引用（不需要断点，直接调用函数属性）
  const g103 = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return this[103]; }' });
  console.log('[2] global[103]:', g103.result?.description?.substring(0, 80));

  // 获取 global[103] 的 [[Scopes]]
  const g103Props = await cdp.send('Runtime.getProperties', { objectId: g103.result.objectId, ownProperties: true });
  let g103ScopesId;
  for (const ip of (g103Props.internalProperties || [])) { if (ip.name === '[[Scopes]]') g103ScopesId = ip.value.objectId; }
  console.log('[3] global[103] 闭包数:', g103ScopesId ? '有' : '无');

  const dump = { time: Date.now(), scopes: [] };
  if (g103ScopesId) {
    const g103Scopes = await cdp.send('Runtime.getProperties', { objectId: g103ScopesId, ownProperties: true });
    for (const scope of g103Scopes.result) {
      if (!scope.value?.objectId) continue;
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      const scopeDump = {};
      for (const v of vars.result) {
        if (v.value?.objectId) {
          try {
            const elems = await getArr(cdp, v.value.objectId, 500);
            if (elems.length > 2) scopeDump[v.name] = elems;
            else if (v.value.description) scopeDump[v.name] = v.value.description.substring(0, 100);
          } catch (e) { scopeDump[v.name] = 'ERR'; }
        } else if (v.value?.value !== undefined) scopeDump[v.name] = v.value.value;
        else scopeDump[v.name] = v.value?.type;
      }
      dump.scopes.push(scopeDump);
    }
  }

  // 也获取 global[103] 对应 dispatcher 源码（通过闭包里的 _$fy）
  const fname = path.join(OUT, 'dispatcher_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(dump));
  console.log('[4] 已保存:', fname);

  // 分析：找字节码数组（子程序）
  console.log('\n=== 闭包数组 ===');
  dump.scopes.forEach((s, si) => {
    console.log('--- scope', si, '---');
    for (const [k, v] of Object.entries(s)) {
      if (Array.isArray(v)) console.log('  ' + k + '[' + v.length + ']: ' + v.join(','));
      else console.log('  ' + k + ': ' + String(v).substring(0, 80));
    }
  });

  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 150000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
