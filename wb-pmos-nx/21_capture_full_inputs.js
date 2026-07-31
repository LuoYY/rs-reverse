/**
 * 21_capture_full_inputs.js
 *
 * hook global[185]（encryptMode1）/ [187]（XOR）/ [598]（numarrAddTime）
 * 保存完整输入：
 *   - 内层加密输入（275B）+ 密钥（21B）
 *   - 外层加密输入（353B）+ 密钥（21B）
 *   - XOR 的 keys2（48B）
 * 用于还原 basearr 结构
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

  let challenge = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
      } catch (e) {}
    }
  });

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  console.log('challenge nsd=' + (challenge ? challenge.nsd : 'null'));

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
        const c = JSON.parse(chk.result.value);
        if (c.t185 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }

  // hook [185] [187] [598] [599]
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var log = [];
      this.__fullLog = log;
      function wrap(idx) {
        var orig = self[idx];
        if (typeof orig !== 'function') return;
        self[idx] = function() {
          try {
            var entry = { idx: idx, time: Date.now(), args: Array.from(arguments).map(function(x){ return Array.isArray(x) ? 'arr[' + x.length + ']' : typeof x; }) };
            if (Array.isArray(arguments[0])) entry.arg0 = arguments[0].slice();
            if (Array.isArray(arguments[1])) entry.arg1 = arguments[1].slice();
            var r = orig.apply(this, arguments);
            if (Array.isArray(r)) { entry.res = 'arr[' + r.length + ']'; entry.resArr = r.slice(); }
            else entry.res = typeof r;
            log.push(entry);
          } catch (e) { return orig.apply(this, arguments); }
          return orig.apply(this, arguments);
        };
      }
      wrap(185); wrap(187); wrap(598); wrap(599);
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发请求（cookie 生成）
  console.log('触发请求...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1500);

  const logR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__fullLog || []); }', returnByValue: true });
  const log = JSON.parse(logR.result.value);
  const cookies = await context.cookies();

  const out = { capturedAt: Date.now(), challenge, log, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'full_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('log:', log.length, '已保存:', fname);

  // 摘要：185 调用 + 187 调用
  console.log('\n=== 内层加密输入（第一次 275B）===');
  const inner = log.find(e => e.idx === 185 && e.arg0 && e.arg0.length > 250 && e.arg0.length < 300);
  if (inner) {
    console.log('len:', inner.arg0.length, '→', inner.res);
    console.log('完整:', inner.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('key21:', inner.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  console.log('\n=== 外层加密输入（353B）===');
  const outer = log.find(e => e.idx === 185 && e.arg0 && e.arg0.length >= 300);
  if (outer) {
    console.log('len:', outer.arg0.length, '→', outer.res);
    console.log('完整:', outer.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('key21:', outer.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  console.log('\n=== XOR [187] 调用 ===');
  log.filter(e => e.idx === 187).forEach((e, i) => {
    console.log('[' + i + ']', e.args.join(' | '), 'arg0 前8:', e.arg0 ? e.arg0.slice(0, 8).map(b => b.toString(16)).join(' ') : '');
    if (e.arg1 && e.arg1.length === 48) console.log('  keys2(48B):', e.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });
  console.log('\n=== [598] numarrAddTime 调用（16→21）===');
  log.filter(e => e.idx === 598).slice(0, 4).forEach((e, i) => {
    console.log('[' + i + '] in16:', e.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('   out21:', e.resArr.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
