/**
 * 24_capture_inner_input.js
 *
 * 精确记录：
 *   - [187] XOR 的第三参数（num：XOR 多少字节）及完整数组
 *   - [185] 内层加密的完整输入（288B）+ 密钥
 *   - [598] keys16
 * 目标：还原 numenc(basearr) → huffman 解码 → basearr 明文
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
        if (JSON.parse(chk.result.value).t185 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }

  // hook [185] [187] [598]：记录完整参数 + 数值
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var log = [];
      this.__capLog = log;
      function wrap(idx) {
        var orig = self[idx];
        if (typeof orig !== 'function') return;
        self[idx] = function() {
          try {
            var entry = { idx: idx, time: Date.now() };
            entry.args = [];
            for (var a = 0; a < arguments.length; a++) {
              var x = arguments[a];
              if (Array.isArray(x)) entry.args.push({ t: 'arr', len: x.length, d: x.slice() });
              else entry.args.push({ t: typeof x, v: x });
            }
            var r = orig.apply(this, arguments);
            if (Array.isArray(r)) entry.res = { t: 'arr', len: r.length, d: r.slice() };
            else entry.res = { t: typeof r, v: r };
            log.push(entry);
          } catch (e) { return orig.apply(this, arguments); }
          return orig.apply(this, arguments);
        };
      }
      wrap(185); wrap(187); wrap(598);
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

  const logR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__capLog || []); }', returnByValue: true });
  const log = JSON.parse(logR.result.value);
  const cookies = await context.cookies();
  const out = { capturedAt: Date.now(), challenge, log, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'inner_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('log:', log.length, '已保存:', fname);

  // 摘要
  console.log('\n=== [187] XOR 调用 ===');
  log.filter(e => e.idx === 187).forEach((e, i) => {
    const a0 = e.args[0], a1 = e.args[1], a2 = e.args[2];
    console.log('[' + i + '] arr[' + a0.len + '] | arr[' + a1.len + '] | num=' + (a2 ? a2.v : '?'));
    if (i === 0) {
      console.log('  arg0 前32:', a0.d.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  keys2:', a1.d.map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  });
  console.log('\n=== [185] 内层加密（输入 200-350B）===');
  log.filter(e => e.idx === 185 && e.args[0] && e.args[0].t === 'arr' && e.args[0].len >= 200 && e.args[0].len <= 350).forEach((e, i) => {
    console.log('[' + i + '] in=' + e.args[0].len + ' key=' + e.args[1].len + ' → ' + e.res.len);
    console.log('  in 完整:', e.args[0].d.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });
  console.log('\n=== [598] keys16/17 ===');
  log.filter(e => e.idx === 598).forEach((e, i) => {
    if (e.args[0] && e.args[0].t === 'arr') console.log('[' + i + '] in16:', e.args[0].d.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
