/**
 * 18_capture_global_at_encrypt.js
 *
 * 终极关联捕获：在 [165] 断点时，dump VM 帧里的 global 数组内容
 *   - 明文24 + key21（与浏览器加密完全同帧）
 *   - global 数组（含 keys2/16/17、常量池、basearr、keyname 等）
 *   - 请求对象（URL、method）
 * 一次捕获解决所有关联问题
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
  console.log('[1] 启动...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  const challenges = [];
  page.on('response', async (resp) => {
    if (resp.status() === 412) {
      try {
        const body = await resp.text();
        challenges.push({ nsd: parseInt((body.match(/\$_ts\.nsd\s*=\s*(\d+)/) || [])[1]), cd: (body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/) || [])[1] });
        console.log('[challenge#' + challenges.length + '] nsd=' + challenges[challenges.length - 1].nsd + ' cdLen=' + (challenges[challenges.length - 1].cd || '').length);
      } catch (e) {}
    }
  });

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // 定位 global
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

  let hitCount = 0;
  cdp.on('Debugger.paused', async (params) => {
    hitCount++;
    const dump = { hit: hitCount, time: Date.now(), challenge: challenges[challenges.length - 1] || null, cookieNames: [], frame0: null, vmFrame: null };

    // frame 0 = [165]，提取参数
    const f0 = params.callFrames[0];
    for (const scope of f0.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (p.name === '_$$g' && p.value?.objectId) {
          const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          dump.frame0 = { plain24: arr.result.slice(0, 24).map(x => x.value?.value) };
        }
        if (p.name === '_$dI' && p.value?.objectId) {
          const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          dump.frame0 = dump.frame0 || {};
          dump.frame0.key21 = arr.result.slice(0, 24).map(x => x.value?.value);
        }
      }
    }

    // 找 VM 帧（含 global 数组 = Array(48x)）
    for (const frame of params.callFrames) {
      for (const scope of frame.scopeChain) {
        if (!scope.object?.objectId) continue;
        const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
        for (const p of props.result) {
          if (p.value?.description && /Array\(\d{3}\)/.test(p.value.description)) {
            const desc = p.value.description;
            const len = parseInt(desc.match(/\d+/)[0]);
            if (len >= 400 && len <= 1200) {
              // global 数组！提取内容
              const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
              const elems = arr.result.map(x => x.value?.value !== undefined ? x.value.value : (x.value?.description || 'func'));
              dump.vmFrame = { globalName: p.name, globalLen: len, global: elems };
            }
          }
        }
      }
      if (dump.vmFrame) break;
    }

    // cookies
    try { dump.cookieNames = (await context.cookies()).map(c => c.name); } catch (e) {}

    const fname = path.join(OUT, 'global_at_enc_' + hitCount + '_' + Date.now() + '.json');
    fs.writeFileSync(fname, JSON.stringify(dump, null, 2));
    console.log('  暂停 ' + hitCount + ' → ' + fname + (dump.frame0 ? ' plain=' + (dump.frame0.plain24 || []).map(b => (b === undefined ? '??' : b.toString(16).padStart(2, '0'))).join(' ').substring(0, 80) : ''));
    if (hitCount < 8) await cdp.send('Debugger.resume').catch(() => {});
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
