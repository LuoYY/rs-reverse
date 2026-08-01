/**
 * 326_hook_plain24.js
 * nx：页面加载完成后 hook global 加密函数 → 抓 query 加密的 (plain24, key21)
 * 参考 xj 41 号，改：goto 后启用 CDP，逐步定位，断点 hook [165] 或相近索引
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const OUT = '/tmp/nx_enc_calls';

async function safe(cdp, m, p) { try { return await cdp.send(m, p); } catch (e) { return null; } }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  console.log('[1] goto');
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) { console.log('goto:', e.message.substring(0, 40)); }
  await page.waitForTimeout(10000);
  console.log('标题:', await page.evaluate(() => document.title).catch(() => '?'));

  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  // 定位 send → dispatcher → global
  const sendSrcR = await safe(cdp, 'Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const src = sendSrcR && sendSrcR.result.value;
  if (!src) { console.log('无 send 源码'); await browser.close(); process.exit(1); }
  console.log('[2] send 源码:', src.substring(0, 150).replace(/\n/g, ' '));
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
  if (!dId) { console.log('未找到 dispatcher'); await browser.close(); process.exit(1); }
  const dSrcR = await safe(cdp, 'Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const dsrc = dSrcR && dSrcR.result.value;
  console.log('[3] dispatcher 源码:', (dsrc || '').substring(0, 200).replace(/\n/g, ' '));
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
  if (!globalId) { console.log('未找到 global 数组'); await browser.close(); process.exit(1); }

  // dump 索引
  const glob = await safe(cdp, 'Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ var out={}; for(var i=0;i<260;i++){ var v=this[i]; if(typeof v==="function") out[i]="fn"; else if(Array.isArray(v)) out[i]="arr:"+v.length; } return out; }', returnByValue: true });
  console.log('[4] global 函数/数组:', JSON.stringify(glob.result.value).substring(0, 700));

  // 找到加密函数：扫描 fn，检查参数形状（第一个参数为 24 长度数组）
  const scan = await safe(cdp, 'Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: `function(){
    var fns = {};
    for(var i=0;i<260;i++){ if(typeof this[i]==='function'){ var s=Function.prototype.toString.call(this[i]); if(s.indexOf('getCfg')>-1 || s.indexOf('encode')>-1 || (s.length>200 && s.indexOf('16')>-1 && s.indexOf('24')>-1)) fns[i]=s.substring(0,80).replace(/\\n/g,' '); } }
    return fns;
  }`, returnByValue: true });
  console.log('[5] 候选加密函数:', JSON.stringify(scan.result.value).substring(0, 800));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
