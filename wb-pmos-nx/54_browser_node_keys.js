/**
 * 54_browser_node_keys.js
 *
 * 浏览器抓 keys（hook 598/187）→ 保存 challenge
 * Node 用同 cd 跑管线 → 对比 keys2/keys16/keys17
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
  console.log('challenge nsd:', challenge ? challenge.nsd : 'null');

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
          functionDeclaration: 'function(){ return JSON.stringify({ t185: typeof this[185] }); }',
          returnByValue: true,
        });
        if (JSON.parse(chk.result.value).t185 === 'function') { globalId = v.value.objectId; break; }
      }
    }
    if (globalId) break;
  }
  if (!globalId) { console.log('未找到 global'); await browser.close(); return; }

  // hook [185]/[187]/[598] 抓 keys + numenc
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var data = { keys16: [], keys17: [], keys2: [], innerInput: null };
      function wrap(idx, onCall) {
        var orig = self[idx];
        if (typeof orig !== 'function') return;
        self[idx] = function() {
          var r = orig.apply(this, arguments);
          try { onCall(arguments, r); } catch(e) {}
          return r;
        };
      }
      wrap(598, function(a) {
        if (Array.isArray(a[0]) && a[0].length === 16) {
          if (!data.keys16.length) data.keys16 = a[0].slice();
          else if (!data.keys17.length && !a[0].every(function(b,i){return b===data.keys16[i]})) data.keys17 = a[0].slice();
        }
      });
      wrap(187, function(a) {
        if (Array.isArray(a[1]) && a[1].length === 48) data.keys2 = a[1].slice();
      });
      wrap(185, function(a) {
        if (Array.isArray(a[0]) && a[0].length === 288 && Array.isArray(a[1])) {
          if (!data.innerInput) data.innerInput = a[0].slice();
        }
      });
      self.__keyData = data;
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发请求
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  await page.waitForTimeout(1000);

  const dataR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__keyData || {}); }', returnByValue: true });
  const data = JSON.parse(dataR.result.value);
  console.log('\n浏览器 keys16:', data.keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys17:', data.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys2 :', data.keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 innerInput:', data.innerInput ? data.innerInput.length : 'null');

  // cookies
  const cookies = await context.cookies();
  const out = { capturedAt: Date.now(), challenge, browserKeys: data, cookies: cookies.map(c => ({ name: c.name, value: c.value })) };
  const fname = path.join(OUT, 'sync_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('已保存:', fname);

  // 浏览器保持打开，供 Node 对比后重放（保存到标记文件）
  fs.writeFileSync(path.join(OUT, 'browser_ready.json'), JSON.stringify({ ready: true, file: fname }));

  // 等待 Node 完成对比（30 秒超时）
  console.log('\n等待 Node 对比...');
  for (let i = 0; i < 30; i++) {
    if (fs.existsSync(path.join(OUT, 'node_done.json'))) break;
    await page.waitForTimeout(1000);
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
