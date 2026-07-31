/**
 * 47_hook_xor_103.js
 *
 * 最终决定性实验：hook global[157]（XOR 函数）+ global[103]（plain24 构造）
 * 触发 query，记录：
 *   - global[157] 调用参数（arr, xor_key, len）→ mask 来源直接可见
 *   - global[103] 返回（plain24）→ 构造结果
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
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  console.log('[1] 加载 + reload...');
  await page.goto(TARGET, { timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 4000));
  await page.reload({ timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 9000));

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

  // hook global[157] (XOR) 轻量版
  console.log('[2] hook global[157] (XOR)...');
  const hookR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){
      var self = this;
      var log = [];
      this.__xorLog = log;
      var orig = this[157];
      if (typeof orig !== 'function') return 'no-157';
      this[157] = function() {
        try {
          if (log.length < 50) {
            var a0 = Array.isArray(arguments[0]) ? arguments[0].slice(0, 16) : arguments[0];
            var a1 = Array.isArray(arguments[1]) ? arguments[1].slice(0, 16) : arguments[1];
            log.push({ args: [a0, a1, arguments[2]], stack: (new Error()).stack.substring(0, 800) });
          }
        } catch(e) {}
        return orig.apply(this, arguments);
      };
      return 'ok';
    }`,
    returnByValue: true,
  });
  console.log('  hook:', hookR.result.value);

  // 触发 query
  console.log('[3] 触发 POST...');
  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('  结果:', trig.result.value);

  // 导出日志
  const logR = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return JSON.stringify(this.__xorLog || []); }', returnByValue: true });
  const log = JSON.parse(logR.result.value);
  const fname = path.join(OUT, 'xorlog_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(log, null, 2));
  console.log('[4] 日志数:', log.length, '已保存:', fname);

  // 打印关键记录
  console.log('\n=== global[157] (XOR) 调用 ===');
  log.filter(e => e.idx === 157).forEach((e, i) => {
    console.log(`[${i}] args: ${e.args.map(a => a.t === 'arr' ? 'arr[' + a.len + ']=' + a.d.join(',') : a.v).join(' | ')}`);
    console.log('  stack: ' + e.stack.split('\n').slice(1, 4).join(' | '));
  });
  console.log('\n=== global[103] (构造) 调用 ===');
  log.filter(e => e.idx === 103).forEach((e, i) => {
    console.log(`[${i}] args: ${e.args.map(a => a.t === 'arr' ? 'arr[' + a.len + ']' : a.v).join(' | ')}`);
    console.log('  返回: ' + (e.resultType === 'arr' ? 'arr[' + e.result.length + ']=' + e.result.join(',') : e.resultType));
  });

  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 150000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
