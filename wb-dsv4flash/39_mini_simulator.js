/**
 * 39_mini_simulator.js
 *
 * 终极方案：在 [165] 断点，用 evaluateOnCallFrame 在 frame1 里
 * 以真实闭包环境重放 VM 字节码，hook push/slice/concat/索引写入，
 * 捕获 plain24 数组的完整构造过程
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

    // 找 frame1 变量名：VM 上下文（含 206 数组的对象）、参数数组（len 4）
    let vmCtxName = null, argsName = null;
    for (const scope of f1.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (!p.value?.objectId) continue;
        const desc = p.value.description || '';
        if (/Array\(4\)/.test(desc) && !argsName) argsName = p.name;
        if (desc.includes('Object')) {
          const p2 = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
          for (const pp of p2.result) {
            if (pp.value?.description && /Array\(20\d\)/.test(pp.value.description)) vmCtxName = p.name;
          }
        }
      }
    }
    console.log('  VM上下文:', vmCtxName, '参数:', argsName);

    const expr = `(function(){
      var out = { err: null, records: [], vmCtxName: ${JSON.stringify(vmCtxName)}, argsName: ${JSON.stringify(argsName)}, arg0: null, arg2: null, arg3: null, replayDone: false };
      try {
        var vmCtx = ${vmCtxName || 'undefined'};
        var args = ${argsName || 'undefined'};
        if (vmCtx) {
          // 找字节码数组（vmCtx 里的 206 数组）
          for (var k in vmCtx) { if (Array.isArray(vmCtx[k]) && vmCtx[k].length > 100) { out.bcKey = k; out.bc = vmCtx[k]; } }
        }
        if (args && args.length > 0) {
          out.arg0 = Array.isArray(args[0]) ? args[0].slice(0, 60) : String(args[0]);
          if (args.length > 2) out.arg2 = Array.isArray(args[2]) ? args[2].slice(0, 24) : String(args[2]);
          if (args.length > 3) out.arg3 = String(args[3]);
        }
        // hook push/slice/concat/索引写入（Proxy 数组太重，先只 hook push/slice/concat）
        var O_PUSH = Array.prototype.push;
        var O_SLICE = Array.prototype.slice;
        var O_CONCAT = Array.prototype.concat;
        var records = out.records;
        function copyArr(a, max) { var c = []; var n = Math.min(a.length, max||88); for (var i=0;i<n;i++) O_PUSH.call(c, a[i]); return c; }
        function rec(tag, arr, stack) { O_PUSH.call(records, { tag: tag, len: arr.length, content: copyArr(arr, 88), stack: stack.substring(0, 1500) }); }
        Array.prototype.push = function() {
          try {
            var nl = this.length + arguments.length;
            if (nl === 24 && this.length <= 16) {
              var c = [];
              for (var i=0;i<this.length;i++) O_PUSH.call(c, this[i]);
              for (var j=0;j<arguments.length;j++) O_PUSH.call(c, arguments[j]);
              rec('push', c, (new Error()).stack);
            }
          } catch(e) {}
          return O_PUSH.apply(this, arguments);
        };
        Array.prototype.slice = function() {
          try {
            var r = O_SLICE.apply(this, arguments);
            if (r && r.length === 24) rec('slice', r, (new Error()).stack);
            return r;
          } catch(e) { return O_SLICE.apply(this, arguments); }
        };
        Array.prototype.concat = function() {
          try {
            var r = O_CONCAT.apply(this, arguments);
            if (r && r.length === 24) rec('concat', r, (new Error()).stack);
            return r;
          } catch(e) { return O_CONCAT.apply(this, arguments); }
        };
        // 重放：用当前帧的 dispatcher（arguments.callee）重新调用
        var disp = arguments.callee;
        out.dispName = typeof disp === 'function' ? disp.name : typeof disp;
        var dispArgs = arguments;
        out.dispArgCount = dispArgs.length;
        out.dispArg0 = dispArgs[0] ? (Array.isArray(dispArgs[0]) ? 'arr' + dispArgs[0].length : typeof dispArgs[0]) : 'null';
        out.dispArg1 = typeof dispArgs[1];
        out.dispArg2 = typeof dispArgs[2];
        out.dispArg3 = dispArgs[3] ? (Array.isArray(dispArgs[3]) ? 'arr' + dispArgs[3].length : typeof dispArgs[3]) : 'null';
        try {
          var r = disp(dispArgs[0], 0, dispArgs[2], dispArgs[3]);
          out.replayReturn = typeof r + (typeof r === 'string' ? ' len' + r.length : '');
        } catch(e) { out.replayErr = e.message.substring(0, 200); }
        out.replayDone = true;
        Array.prototype.push = O_PUSH; Array.prototype.slice = O_SLICE; Array.prototype.concat = O_CONCAT;
      } catch(e) { out.err = e.message + '|' + (e.stack || '').substring(0, 200); }
      return JSON.stringify(out);
    })()`;

    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f1.callFrameId, expression: expr, returnByValue: true });
      const val = r.result?.value;
      if (typeof val === 'string' && val.startsWith('{')) {
        const fname = path.join(OUT, 'sim_' + Date.now() + '.json');
        fs.writeFileSync(fname, val);
        console.log('  已保存:', fname);
      } else {
        console.log('  异常:', JSON.stringify(r).substring(0, 500));
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
  await new Promise(r => setTimeout(r, 5000));
  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 220000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
