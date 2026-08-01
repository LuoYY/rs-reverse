/**
 * 329_hook_all_fns.js
 * nx：对 _$cH/_$eM 表所有函数设调用断点 → 触发 API → 命中时抓 (24B 明文, 21B 密钥)
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const OUT = '/tmp/nx_enc_calls';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(12000);
  console.log('标题:', await page.evaluate(() => document.title).catch(() => '?'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  // 定位 dispatcher → 闭包表
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const src = sendSrcR.result.value;
  const dm = src.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm ? dm[1] : null;
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
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });

  // 收集表 objectId
  const tableIds = {};
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if ((v.name === '_$cH' || v.name === '_$eM') && v.value?.objectId) tableIds[v.name] = v.value.objectId;
    }
  }
  console.log('表:', Object.keys(tableIds));

  // 对所有函数设断点
  let bpCount = 0;
  for (const [tname, tid] of Object.entries(tableIds)) {
    const fns = await cdp.send('Runtime.callFunctionOn', { objectId: tid, functionDeclaration: `function(){ var out=[]; for(var i=0;i<Math.min(this.length,260);i++){ if(typeof this[i]==='function') out.push(i); } return out; }`, returnByValue: true });
    for (const idx of fns.result.value) {
      try {
        const fnObj = await cdp.send('Runtime.callFunctionOn', { objectId: tid, functionDeclaration: `function(){ return this[${idx}]; }` });
        await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: fnObj.result.objectId });
        bpCount++;
      } catch (e) {}
    }
  }
  console.log('已设断点函数数:', bpCount);

  let found = false;
  cdp.on('Debugger.paused', async (params) => {
    if (found) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    const f0 = params.callFrames[0];
    if (!f0) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    // 检查参数：24B 明文 / 21B 密钥
    let plain24 = null, key21 = null, argsInfo = [];
    for (const scope of f0.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (p.value?.objectId) {
          try {
            const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
            const elems = arr.result.filter(x => /^\d+$/.test(x.name)).map(x => x.value?.value);
            if (elems.length === 24 && elems.every(e => typeof e === 'number') && !plain24) plain24 = elems;
            if (elems.length === 21 && elems.every(e => typeof e === 'number') && !key21) key21 = elems;
            if (elems.length === 16 && elems.every(e => typeof e === 'number')) argsInfo.push('16B:' + elems.slice(0, 4).join(','));
          } catch (e) {}
        }
      }
    }
    if (plain24) {
      found = true;
      console.log('\n★★★ 命中 query 加密！plain24:', plain24.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('key21:', key21 ? key21.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
      fs.writeFileSync('/tmp/nx_plain24_key21.json', JSON.stringify({ plain24, key21, t: Date.now() }, null, 2));
      console.log('已保存 /tmp/nx_plain24_key21.json');
    } else {
      // 打印简要参数形状帮助识别
      console.log('暂停(无24B): argsInfo:', argsInfo.slice(0, 5).join(' | '));
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  // 触发 API
  console.log('\n[触发] captcha API...');
  await page.evaluate(async () => {
    await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
  });
  await page.waitForTimeout(8000);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
