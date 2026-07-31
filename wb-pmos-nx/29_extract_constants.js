/**
 * 29_extract_constants.js
 *
 * 提取 nx 站点加密函数 global[185] 的源码与常量表
 * 对比管线 constData 是否一致
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

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

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

  // 提取 [185] [187] [598] [61] [65] 源码 + 常量
  console.log('提取加密函数源码...');
  const srcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var out = {};
      var targets = [185, 187, 598, 599, 118, 61, 65];
      for (var t = 0; t < targets.length; t++) {
        var idx = targets[t];
        var x = this[idx];
        if (typeof x === 'function') out[idx] = { t: 'fn', src: Function.prototype.toString.call(x) };
        else if (Array.isArray(x)) out[idx] = { t: 'arr', len: x.length, d: x.slice(0, 40) };
        else out[idx] = { t: typeof x, v: x };
      }
      return JSON.stringify(out);
    }`,
    returnByValue: true,
  });
  const extracted = JSON.parse(srcR.result.value);
  console.log('已提取:', Object.keys(extracted).join(','));

  // 保存
  fs.writeFileSync(path.join(OUT, 'funcs_constants.json'), JSON.stringify(extracted, null, 2));
  console.log('已保存 captures/funcs_constants.json');

  // 摘要
  for (const [idx, e] of Object.entries(extracted)) {
    if (e.t === 'fn') console.log('\n=== [' + idx + '] fn len=' + e.src.length + ' ===');
    else if (e.t === 'arr') console.log('\n=== [' + idx + '] arr len=' + e.len + ' 前8:', e.d.map(b => b.toString(16)).join(' '));
    else console.log('\n=== [' + idx + '] ' + e.t + ' ' + JSON.stringify(e.v));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
