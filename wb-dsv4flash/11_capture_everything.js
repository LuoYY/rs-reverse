/**
 * 11_capture_everything.js
 *
 * 一次会话内捕获所有可能相关的数据，用于定位 16B 会话值的来源：
 *   1. 挑战页 nsd/cd + O cookie
 *   2. keys30（45 个 keys）
 *   3. [165] 加密调用（明文/密钥）—— 提取 session16 + time3
 *   4. VM 子程序调用（sub 编号 + 完整返回）—— 21B 密钥生成、可能的会话值
 *   5. P cookie
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

  const challenges = [];
  page.on('response', async (resp) => {
    if (resp.status() === 412) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenges.push({ nsd: nsdM ? parseInt(nsdM[1]) : null, cd: cdM ? cdM[1] : null, url: resp.url(), ts: Date.now() });
        console.log('[challenge#' + challenges.length + '] nsd=' + challenges[challenges.length - 1].nsd + ' cdLen=' + (challenges[challenges.length - 1].cd || '').length);
      } catch (e) {}
    }
  });

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);

  // ---- 定位 global 数组 ----
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
  if (!globalName) { console.log('❌ global'); await browser.close(); return; }
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
  if (!globalId) { console.log('❌ global array'); await browser.close(); return; }

  // ---- keys30 + O cookie ----
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

  // ---- Hook [165] + VM 入口点 ----
  const hookR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
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
      // VM 入口点
      var vmLog = [];
      this.__vmLog = vmLog;
      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] !== 'function') continue;
        var src = Function.prototype.toString.call(this[i]);
        var m = src.match(/\\[([0-9]+)\\]/);
        if (m && src.indexOf('push.apply') >= 0 && src.indexOf('.apply(this') >= 0) {
          (function(idx, sub, orig) {
            self[idx] = function() {
              var result = orig.apply(this, arguments);
              var rl = Array.isArray(result) ? 'arr[' + result.length + ']' : typeof result;
              var rd = Array.isArray(result) ? result.slice(0, 32) : (typeof result === 'string' ? result.substring(0, 60) : (typeof result === 'number' ? result : String(result).substring(0, 60)));
              vmLog.push({ sub: sub, idx: idx, resultType: rl, result: rd, time: Date.now() });
              return result;
            };
          })(i, parseInt(m[1]), this[i]);
        }
      }
      return 'ok';
    }`,
    returnByValue: true,
  });
  console.log('[3] Hook 完成');

  // ---- 触发 3 个请求 ----
  console.log('[4] 触发请求...');
  const REQS = [
    { m: 'POST', u: '/px-gateway/GatewayConfig/getGatewayConfig', b: '{}' },
    { m: 'GET', u: '/px-gateway/GatewayConfig/security', b: null },
    { m: 'POST', u: '/px-common-authcenter/auth/v2/captcha/get', b: '{}' },
  ];
  for (const r of REQS) {
    await cdp.send('Runtime.evaluate', {
      expression: `(function(){try{var x=new XMLHttpRequest();x.open('${r.m}','${r.u}',false);x.setRequestHeader('Content-Type','application/json');x.send(${r.b === null ? 'null' : "'" + r.b + "'"});return x.status}catch(e){return e.message}})()`,
      returnByValue: true,
    });
    await page.waitForTimeout(800);
  }

  const encLogR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__encLog || []); }', returnByValue: true });
  const vmLogR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__vmLog || []); }', returnByValue: true });
  const encLog = JSON.parse(encLogR.result.value);
  const vmLog = JSON.parse(vmLogR.result.value);

  const cookies = await context.cookies();
  const out = { capturedAt: Date.now(), challenges, cookies: cookies.map(c => ({ name: c.name, value: c.value })), keys30, encLog, vmLog };
  const fname = path.join(OUT, 'everything_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(out, null, 2));
  console.log('保存:', fname);

  // 摘要
  const enc24 = encLog.filter(c => c.resultType === 'arr[32]' && c.args.join(',').includes('arr[24]'));
  console.log('\n=== 24→32 加密（明文/密钥）===');
  for (const c of enc24) {
    const ele = c.arg1[20];
    const time = ((c.arg1[16]^ele)<<24|(c.arg1[17]^ele)<<16|(c.arg1[18]^ele)<<8|(c.arg1[19]^ele))>>>0;
    console.log('  plain:', c.arg0.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  key  :', c.arg1.map(b => b.toString(16).padStart(2, '0')).join(' '), 'ele=' + ele, 't=' + time);
  }
  console.log('\n=== VM 子程序 arr[21] 输出 ===');
  const arr21s = vmLog.filter(v => v.resultType === 'arr[21]');
  arr21s.forEach((v, i) => console.log('  sub=' + v.sub + ' idx=' + v.idx + ':', v.result.join(',')));

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
