/**
 * 324_nx_hook_encrypt.js
 * nx 站点：定位 global 数组 → dump 函数索引 → 尝试 hook query 加密
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };

async function tryCdp(cdp, method, params) {
  try { return await cdp.send(method, params); } catch (e) { console.log('  !' + method, e.message.substring(0, 80)); return null; }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  console.log('[1] goto...');
  await page.goto(TARGET, { timeout: 90000 }).catch((e) => console.log('goto:', e.message.substring(0, 50)));
  await new Promise(r => setTimeout(r, 15000));
  console.log('标题:', await page.evaluate(() => document.title).catch(() => '?'));

  // 定位 send → dispatcher → global
  const sendSrcR = await tryCdp(cdp, 'Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const src = sendSrcR && sendSrcR.result.value;
  if (!src) { console.log('send 源码获取失败'); await browser.close(); process.exit(1); }
  console.log('[2] send 源码:', src.substring(0, 200).replace(/\n/g, ' '));
  const dm = src.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm ? dm[1] : null;
  console.log('dispatcher:', dName);

  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId = null;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  if (!dId) { console.log('未找到 dispatcher，尝试直接扫全局'); } else {
    const dSrcR = await tryCdp(cdp, 'Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
    const dsrc = dSrcR && dSrcR.result.value;
    console.log('[3] dispatcher 源码:', (dsrc || '').substring(0, 250).replace(/\n/g, ' '));
    const m32 = (dsrc || '').match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
    const globalName = m32 ? m32[1] : null;
    console.log('global 名:', globalName);
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
    if (globalId) {
      const glob = await tryCdp(cdp, 'Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ var out={}; for(var i=0;i<260;i++){ var v=this[i]; if(typeof v==="function") out[i]="fn"; else if(Array.isArray(v)) out[i]="arr:"+v.length; } return out; }', returnByValue: true });
      console.log('[4] global 函数/数组索引:', JSON.stringify(glob.result.value).substring(0, 800));
      const f165 = await tryCdp(cdp, 'Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ var v=this[165]; if(typeof v==="function") return "fn:"+Function.prototype.toString.call(v).substring(0,200); return typeof v; }', returnByValue: true });
      console.log('[5] global[165]:', f165 && f165.result.value);

      // 尝试 hook [165] 和相邻索引
      for (const idx of [165, 164, 166, 103, 157]) {
        const r = await tryCdp(cdp, 'Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: `function(){ var v=this[${idx}]; if(typeof v==="function"){ return "fn"; } return "nofn"; }`, returnByValue: true });
        console.log(`  [${idx}]`, r && r.result.value);
      }
    } else {
      console.log('未找到 global 数组');
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
