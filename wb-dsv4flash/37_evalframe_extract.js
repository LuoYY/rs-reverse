/**
 * 37_evalframe_extract.js
 *
 * 在 [165] 断点，用 Debugger.evaluateOnCallFrame 在 frame1（VM dispatcher）中
 * 提取完整 VM 状态：参数数组、VM 上下文、scope、closure、global、常量池
 * 供字节码反汇编推演
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

  let saved = false;
  cdp.on('Debugger.paused', async (params) => {
    if (saved) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    saved = true;
    console.log('[3] 暂停，frames=' + params.callFrames.length);
    const f1 = params.callFrames[1];
    if (!f1) { console.log('无 frame1'); await cdp.send('Debugger.resume').catch(() => {}); return; }

    // 用 getProperties 找 VM 上下文（含 206 字节码数组的对象）和参数数组
    let vmCtxName = null, argsName = null, bytecodeName = null;
    for (const scope of f1.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (!p.value?.objectId) continue;
        const desc = p.value.description || '';
        if (desc.includes('Object')) {
          // 检查是否含字节码
          const p2 = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          for (const pp of p2.result) {
            if (pp.value?.description && /Array\(206\)/.test(pp.value.description)) {
              vmCtxName = p.name; bytecodeName = pp.name;
            }
          }
        }
        if (desc.includes('Array(4)')) argsName = p.name;
      }
    }
    console.log('  VM上下文:', vmCtxName, '字节码:', bytecodeName, '参数:', argsName);

    // 用 evaluateOnCallFrame 提取
    const expr = `(function(){
      var vmCtx = ${vmCtxName || 'undefined'};
      var args = ${argsName || 'undefined'};
      var out = { vmCtxKeys: [], bytecode: [], closureMap: {}, argsLen: 0 };
      try {
        if (vmCtx) {
          out.vmCtxKeys = Object.keys(vmCtx);
          var bc = vmCtx['${bytecodeName || '_$c9'}'];
          if (Array.isArray(bc)) out.bytecode = bc;
          // closure map _\$cY
          var cy = vmCtx._\$cY;
          if (cy) {
            out.closureMap = {};
            for (var k in cy) {
              if (typeof cy[k] === 'function') out.closureMap[k] = 'fn';
              else out.closureMap[k] = typeof cy[k] === 'object' ? (Array.isArray(cy[k]) ? 'arr[' + cy[k].length + ']' : 'obj') : String(cy[k]).substring(0, 40);
            }
          }
        }
        if (args) {
          out.argsLen = args.length;
          out.args = [];
          for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (Array.isArray(a)) { out.args.push({ t: 'arr', len: a.length, d: a.slice(0, 60) }); }
            else if (typeof a === 'object' && a) {
              var o = {};
              for (var k2 in a) { o[k2] = typeof a[k2] === 'function' ? 'fn' : (Array.isArray(a[k2]) ? 'arr[' + a[k2].length + ']' : (typeof a[k2] === 'object' ? 'obj' : String(a[k2]).substring(0, 30))); }
              out.args.push({ t: 'obj', d: o });
            }
            else out.args.push({ t: typeof a, v: String(a).substring(0, 30) });
          }
        }
      } catch (e) { out.err = e.message; }
      return JSON.stringify(out);
    })()`;
    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f1.callFrameId, expression: expr, returnByValue: true });
      // 处理嵌套：r.result.value
      const val = r.result?.value || r.result?.result?.value;
      if (typeof val === 'string' && val.startsWith('{')) {
        const fname = path.join(OUT, 'vmstate_full_' + Date.now() + '.json');
        fs.writeFileSync(fname, val);
        console.log('  已保存:', fname, '(', val.length, 'chars)');
      } else {
        console.log('  结果异常:', JSON.stringify(r).substring(0, 400));
      }
    } catch (e) {
      console.log('  evaluateOnCallFrame 失败:', e.message.substring(0, 150));
    }
    await cdp.send('Debugger.resume').catch(() => {});
  });

  const trig = await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  console.log('[4] 触发:', trig.result.value);
  await new Promise(r => setTimeout(r, 3000));
  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 200000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
