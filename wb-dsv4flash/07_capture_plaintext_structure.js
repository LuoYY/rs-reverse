/**
 * 07_capture_plaintext_structure.js
 *
 * 捕获 24B 明文的结构：同 URL 不同时间 vs 不同 URL 同时刻
 * 触发模式：交替两个 URL，间隔 2s，共 8 个请求
 * 同时捕获 keys30 + 每个请求的明文/密钥
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

  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  let challenge = null;
  page.on('response', async (resp) => {
    if (challenge) return;
    if (resp.status() === 412) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? parseInt(nsdM[1]) : null, cd: cdM ? cdM[1] : null };
        console.log('[challenge] nsd=' + challenge.nsd + ' cdLen=' + (challenge.cd || '').length);
      } catch (e) {}
    }
  });

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // ---- 定位 global 数组（复用标准流程）----
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
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
  const dSrcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const dSrc = dSrcR.result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  if (!globalName) { console.log('  ❌ 未找到 global'); await browser.close(); return; }
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

  // keys30
  const keys30R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var idx30 = this[30];
      if (!Array.isArray(idx30)) return 'null';
      return JSON.stringify(idx30.map(function(k) {
        if (Array.isArray(k)) return { t: 'arr', len: k.length, d: k.slice(0, 64) };
        return { t: typeof k, v: typeof k === 'string' ? k.substring(0, 200) : k };
      }));
    }`,
    returnByValue: true,
  });
  const keys30 = JSON.parse(keys30R.result.value);

  // 包装 [165]
  const wrapR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var log = [];
      this.__encLog = log;
      var targets = [165, 151];
      for (var t = 0; t < targets.length; t++) {
        var idx = targets[t];
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
      return 'wrapped=' + targets.length;
    }`,
    returnByValue: true,
  });
  console.log('[3] 包装:', wrapR.result.value);

  // ---- 交替触发 8 个请求 ----
  console.log('\n[4] 触发 8 个请求（交替 URL，2s 间隔）...');
  const REQS = [];
  const urls = [
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{}' },
    { m: 'GET', u: '/px-gateway/GatewayConfig/security', b: null },
    { m: 'POST', u: '/px-common-authcenter/auth/v2/captcha/get', b: '{}' },
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{"x":1}' },
    { m: 'GET', u: '/px-gateway/GatewayConfig/security', b: null },
    { m: 'POST', u: '/px-common-authcenter/auth/v2/verifyType/get', b: '{}' },
    { m: 'GET', u: '/px-gateway/GatewayConfig/security', b: null },
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{}' },
  ];
  for (let ri = 0; ri < urls.length; ri++) {
    const r = urls[ri];
    const trig = await cdp.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var x = new XMLHttpRequest();
          x.open('${r.m}', '${r.u}', false);
          x.setRequestHeader('Content-Type', 'application/json');
          x.send(${r.b === null ? 'null' : "'" + r.b + "'"});
          return JSON.stringify({ status: x.status, t: Date.now(), q: (x.responseURL || '').indexOf('r20SZOQm=') >= 0 });
        } catch(e) { return e.message; }
      })()`,
      returnByValue: true,
    });
    let trigData;
    try { trigData = JSON.parse(trig.result.value); } catch (e) { trigData = { status: trig.result.value }; }
    console.log('  [' + ri + '] ' + r.m + ' ' + r.u + ' → ' + trigData.status + ' @' + (trigData.t || '?'));
    await page.waitForTimeout(2000);
  }

  // 导出
  const encLogR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: 'function(){ return JSON.stringify(this.__encLog || []); }',
    returnByValue: true,
  });
  const encLog = JSON.parse(encLogR.result.value);

  const out = { capturedAt: Date.now(), challenge, keys30, encLog };
  const fname = path.join(OUT, 'plaintext_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('\n=== 保存:', fname);

  // 摘要：24→32 调用 + 明文
  console.log('\n=== 24→32 调用（明文+密钥）===');
  for (const c of encLog) {
    if (c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]')) {
      console.log('  plain:', c.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  key  :', c.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('  ele  :', c.arg1[20], 'time:', ((c.arg1[16]^c.arg1[20])<<24|(c.arg1[17]^c.arg1[20])<<16|(c.arg1[18]^c.arg1[20])<<8|(c.arg1[19]^c.arg1[20]))>>>0);
      console.log();
    }
  }
  console.log('keys17:', keys30[17].d.map(b => b.toString(16).padStart(2, '0')).join(' '));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
