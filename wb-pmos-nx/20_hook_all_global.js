/**
 * 20_hook_all_global.js
 *
 * 批量 hook global 数组所有函数，记录"接收数组参数"的调用
 * 目的：定位 nx 的加密函数（如 encryptMode1: 24B→32B / 209B→224B）
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

  // 定位 global（607）
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
          functionDeclaration: 'function(){ return JSON.stringify({ t165: typeof this[165], t157: typeof this[157] }); }',
          returnByValue: true,
        });
        const c = JSON.parse(chk.result.value);
        if (c.t165 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }
  console.log('global 定位成功');

  // hook 所有函数（只记录参数含数组的调用）
  console.log('hook 所有 global 函数...');
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var log = [];
      this.__hookLog = log;
      var count = 0;
      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] !== 'function') continue;
        (function(idx, orig) {
          self[idx] = function() {
            try {
              var hasArr = false;
              for (var a = 0; a < arguments.length; a++) if (Array.isArray(arguments[a])) { hasArr = true; break; }
              if (hasArr && count < 200) {
                count++;
                var entry = { idx: idx, time: Date.now(), args: Array.from(arguments).map(function(x){ return Array.isArray(x) ? 'arr[' + x.length + ']' : typeof x; }) };
                if (Array.isArray(arguments[0])) entry.arg0 = arguments[0].slice(0, 32);
                if (Array.isArray(arguments[1])) entry.arg1 = arguments[1].slice(0, 32);
                var r = orig.apply(this, arguments);
                if (Array.isArray(r)) { entry.res = 'arr[' + r.length + ']'; entry.res0 = r.slice(0, 16); }
                else entry.res = typeof r;
                log.push(entry);
              }
              return orig.apply(this, arguments);
            } catch (e) { return orig.apply(this, arguments); }
          };
        })(i, this[i]);
      }
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发请求
  console.log('触发请求...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1500);

  const logR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__hookLog || []); }', returnByValue: true });
  const log = JSON.parse(logR.result.value);
  console.log('调用记录:', log.length);

  // 找加密特征调用
  console.log('\n=== 数组→数组 调用（加密候选）===');
  const enc = log.filter(e => e.res && e.res.startsWith('arr['));
  enc.forEach(e => {
    console.log('  [' + e.idx + '] ' + e.args.join(' | ') + ' → ' + e.res);
    if (e.arg0 && e.arg0.length <= 32) console.log('    arg0:', e.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  const cookies = await context.cookies();
  const out = { capturedAt: Date.now(), challenge, log, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'hooklog_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('已保存:', fname);

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
