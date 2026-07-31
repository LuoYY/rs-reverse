/**
 * 08_capture_encrypt.js
 *
 * 用 607 数组（global）hook 加密函数，抓取 query 加密调用（明文/密钥），
 * 导出浏览器真实 cookies，对比管线 keys。
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

  // 定位 dispatcher + global（607 数组，[165] 是函数）
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

  // 找 607 数组
  let globalId = null, globalName = null;
  for (const scope of dScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      const desc = v.value.description || '';
      if (desc === 'Array(607)') {
        const chk = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function(){ return JSON.stringify({ t165: typeof this[165], t157: typeof this[157], t103: typeof this[103], t7: typeof this[7] }); }',
          returnByValue: true,
        });
        const c = JSON.parse(chk.result.value);
        if (c.t165 === 'function') { globalId = v.value.objectId; globalName = v.name; break; }
      }
    }
    if (globalId) break;
  }
  console.log('global:', globalName, globalId ? '✓' : '✗');
  if (!globalId) { await browser.close(); return; }

  // hook [165]/[151]
  await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var log = [];
      this.__encLog = log;
      for (var t = 0; t < 2; t++) {
        var idx = [165, 151][t];
        if (typeof this[idx] !== 'function') continue;
        (function(idx, orig) {
          self[idx] = function() {
            var entry = { idx: idx, time: Date.now(), args: Array.from(arguments).map(function(x){ if(Array.isArray(x)) return 'arr['+x.length+']'; return typeof x; }) };
            if (Array.isArray(arguments[0])) { entry.arg0 = arguments[0].slice(0, 48); entry.dataLen = arguments[0].length; }
            if (Array.isArray(arguments[1])) { entry.arg1 = arguments[1].slice(0, 48); entry.keyLen = arguments[1].length; }
            entry.flag = arguments[2];
            var result = orig.apply(this, arguments);
            if (Array.isArray(result)) { entry.resultType = 'arr['+result.length+']'; entry.result = result.slice(0, 48); }
            else entry.resultType = typeof result;
            log.push(entry);
            return result;
          };
        })(idx, this[idx]);
      }
      return 'ok';
    }`,
    returnByValue: true,
  });

  // 触发业务请求（nx 站点的实际 API 路径需要探索，先用常见路径）
  console.log('触发 POST...');
  const urls = ['/px-gateway/GatewayConfig/getGatewayConfig', '/px-gateway/GatewayConfig/security'];
  for (const u of urls) {
    const trig = await cdp.send('Runtime.evaluate', {
      expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','${u}',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return JSON.stringify({status:x.status,url:x.responseURL})}catch(e){return e.message}})()`,
      returnByValue: true,
    });
    console.log(' ', u, '→', trig.result.value);
    await page.waitForTimeout(1000);
  }

  const encLogR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__encLog || []); }', returnByValue: true });
  const encLog = JSON.parse(encLogR.result.value);
  console.log('加密日志:', encLog.length);

  const cookies = await context.cookies();
  console.log('cookies:');
  cookies.forEach(c => console.log('  ' + c.name + ' len=' + c.value.length + ' ' + c.value.substring(0, 40) + '...'));

  // keys30 从 global[30]（如果是数组）
  const keys30R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var k = this[30];
      if (Array.isArray(k)) return JSON.stringify({ t: 'arr', len: k.length, all: k.map(function(x){ return Array.isArray(x) ? { t:'arr', len:x.length, d:x.slice(0,48) } : { t: typeof x, v: typeof x === 'string' ? x.substring(0,100) : x }; }) });
      return JSON.stringify({ t: typeof k });
    }`,
    returnByValue: true,
  });
  console.log('global[30]:', keys30R.result.value.substring(0, 300));

  const out = { capturedAt: Date.now(), challenge, cookies: cookies.map(c => ({ name: c.name, value: c.value })), encLog };
  const fname = path.join(OUT, 'enc_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('已保存:', fname);

  // 24→32 摘要
  const enc24 = encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
  console.log('\n=== 24→32 加密调用 ===');
  enc24.forEach((c, i) => {
    console.log('[' + i + '] plain:', c.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
    if (c.arg1) {
      const ele = c.arg1[20];
      const base16 = c.arg1.slice(0, 16).map(b => b ^ ele);
      console.log('    key21:', c.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('    base16:', base16.map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  });

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
