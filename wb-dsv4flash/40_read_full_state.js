/**
 * 40_read_full_state.js
 *
 * 只读取（不重放）：在 [165] 断点用 evaluateOnCallFrame 读取 frame1 完整状态
 * 确认 dispatcher 参数（this/scope/closure/global/constPool）+ VM 上下文
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
  await cdp.send('Debugger.enable');

  console.log('[1] 加载 + reload...');
  await page.goto(TARGET, { timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 5000));
  await page.reload({ timeout: 90000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 12000));

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

  const f165 = await cdp.send('Runtime.callFunctionOn', { objectId: globalId, functionDeclaration: 'function(){ return this[165]; }' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', { objectId: f165.result.objectId });
  console.log('[2] 断点设置');

  let done = false;
  cdp.on('Debugger.paused', async (params) => {
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    done = true;
    console.log('[3] 暂停');
    const f1 = params.callFrames[1];
    if (!f1) { await cdp.send('Debugger.resume').catch(() => {}); return; }

    // 找所有 len-4 数组名和 VM 上下文名
    const candidates = [];
    let vmCtxName = null;
    for (const scope of f1.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (!p.value?.objectId) continue;
        const desc = p.value.description || '';
        if (/Array\(4\)/.test(desc)) candidates.push(p.name);
        if (desc.includes('Object')) {
          const p2 = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          for (const pp of p2.result) {
            if (pp.value?.description && /Array\(20\d\)/.test(pp.value.description)) vmCtxName = p.name;
          }
        }
      }
    }
    console.log('  len-4 数组:', candidates.join(','), 'VM上下文:', vmCtxName);

    // 用 evaluateOnCallFrame 读取（引用参数名）
    const expr = `(function(){
      var out = { candidates: [], vmCtx: null, dispatcherArgs: null };
      try {
        ${candidates.map(n => `out.candidates.push({name:'${n}', val: (typeof ${n} !== 'undefined') ? JSON.stringify(${n}).substring(0, 3000) : 'UNDEF'});`).join('\n')}
        if (${vmCtxName ? "'" + vmCtxName + "' in this || true" : 'false'}) {
          try {
            var ctx = ${vmCtxName || 'undefined'};
            if (ctx) {
              out.vmCtx = {};
              for (var k in ctx) {
                var v = ctx[k];
                out.vmCtx[k] = Array.isArray(v) ? 'arr[' + v.length + ']' : (typeof v === 'function' ? 'fn' : (v && typeof v === 'object' ? 'obj' : String(v)));
              }
              // closure 表
              for (var k2 in ctx) {
                var v2 = ctx[k2];
                if (v2 && typeof v2 === 'object' && !Array.isArray(v2)) {
                  var o = {};
                  for (var k3 in v2) { var v3 = v2[k3]; o[k3] = typeof v3 === 'function' ? 'fn' : (Array.isArray(v3) ? 'arr[' + v3.length + ']' : String(v3).substring(0, 30)); }
                  out.vmCtx['detail_' + k2] = o;
                }
              }
            }
          } catch(e) { out.vmCtxErr = e.message; }
        }
      } catch(e) { out.err = e.message; }
      return JSON.stringify(out);
    })()`;

    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f1.callFrameId, expression: expr, returnByValue: true });
      const val = r.result?.value;
      if (typeof val === 'string' && val.startsWith('{')) {
        const fname = path.join(OUT, 'state_' + Date.now() + '.json');
        fs.writeFileSync(fname, val);
        console.log('  已保存:', fname);
      } else {
        console.log('  异常:', JSON.stringify(r).substring(0, 400));
      }
    } catch (e) {
      console.log('  evaluateOnCallFrame 失败:', e.message.substring(0, 200));
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await new Promise(r => setTimeout(r, 4000));
  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 200000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
