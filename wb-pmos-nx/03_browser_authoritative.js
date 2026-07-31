/**
 * 03_browser_authoritative.js
 *
 * 浏览器权威对照（Patchright + 代理）：访问 nx 站点，
 *   1. 定位 global 数组 → 提取 keys30（keys16/17/2 真值）
 *   2. hook [165] 加密 → 捕获 query 加密调用（明文/密钥）
 *   3. 导出真实 O+P cookie
 *   4. 记录挑战页 nsd/cd
 *
 * 用法：NODE_PATH=...rs-reverse_kimi/node_modules node 03_browser_authoritative.js
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
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('[1] 启动浏览器（代理）...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  // 记录挑战页
  let challenge = null;
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
        console.log('[challenge] nsd=' + challenge.nsd + ' cdLen=' + (challenge.cd || '').length);
      } catch (e) {}
    }
  });

  console.log('[2] 加载 + reload（nx 慢，多等）...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 定位 global 数组（send hook 闭包链）
  console.log('[3] 定位 global 数组...');
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  if (!dm) { console.log('  ❌ send 源码无 dispatcher 模式:', sendSrc.substring(0, 200)); await browser.close(); return; }
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
  if (!dId) { console.log('  ❌ 未找到 dispatcher'); await browser.close(); return; }
  const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const dSrc = dSrcR.result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  if (!globalName) { console.log('  ❌ 未找到 global 名。dSrc:', dSrc.substring(0, 300)); await browser.close(); return; }
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
  if (!globalId) { console.log('  ❌ 未找到 global'); await browser.close(); return; }
  console.log('  ✓ global 定位成功（' + globalName + '）');

  // keys30
  console.log('[4] 提取 keys30...');
  const keys30R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var idx30 = this[30];
      if (!Array.isArray(idx30)) return 'null';
      return JSON.stringify(idx30.map(function(k) {
        if (Array.isArray(k)) return { t: 'arr', len: k.length, d: k.slice(0, 64) };
        return { t: typeof k, v: typeof k === 'string' ? k.substring(0, 300) : k };
      }));
    }`,
    returnByValue: true,
  });
  const keys30 = JSON.parse(keys30R.result.value);
  console.log('  keys[2] len:', keys30[2]?.len, ' keys[16] len:', keys30[16]?.len, ' keys[17] len:', keys30[17]?.len);
  if (keys30[16] && keys30[16].d) console.log('  keys16:', keys30[16].d.map(b => b.toString(16).padStart(2, '0')).join(' '));
  if (keys30[17] && keys30[17].d) console.log('  keys17:', keys30[17].d.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // hook [165] 加密
  console.log('[5] hook [165]...');
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

  // 触发请求
  console.log('[6] 触发 POST...');
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return JSON.stringify({status:x.status,url:x.responseURL})}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('  触发结果:', trig.result.value);

  const encLogR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__encLog || []); }', returnByValue: true });
  const encLog = JSON.parse(encLogR.result.value);
  console.log('  加密日志数:', encLog.length);

  // cookies
  const cookies = await context.cookies();
  console.log('[7] cookies:');
  cookies.forEach(c => console.log('  ' + c.name + ' len=' + c.value.length + ' ' + c.value.substring(0, 30) + '...'));

  // 保存
  const out = { capturedAt: Date.now(), challenge, cookies: cookies.map(c => ({ name: c.name, value: c.value })), keys30, encLog };
  const fname = path.join(OUT, 'browser_auth_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('\n已保存:', fname);

  // 摘要 24→32
  const enc24 = encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
  console.log('\n=== 24→32 加密调用 ===');
  enc24.forEach((c, i) => {
    console.log('[' + i + '] plain:', c.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
    if (c.arg1) console.log('    key  :', c.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '));
  });

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
