/**
 * 38_replay_vm.js
 *
 * 终极定位：在 [165] 断点时，用 evaluateOnCallFrame 重新调用 VM dispatcher
 * 从 PC 0 重放字节码（真实闭包环境），hook push/slice/concat
 * 捕获 plain24 数组的完整构造过程（每个字节的来源）
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
    console.log('[3] 暂停，frames=' + params.callFrames.length);
    const f1 = params.callFrames[1];
    if (!f1) { await cdp.send('Debugger.resume').catch(() => {}); return; }

    const expr = `(function(){
      var results = { err: null, records: [], arg0: null, arg2: null, replayDone: false };
      try {
        var disp = arguments.callee;
        var dispArgs = arguments;
        var vmCtx = dispArgs[0];
        var endPC = dispArgs[2];
        var vmArgs = dispArgs[3];
        results.vmCtxKeys = Object.keys(vmCtx || {});
        results.argCount = dispArgs.length;

        // 记录 nextarr/keys2 和 key21
        if (vmArgs && vmArgs.length > 0) {
          results.arg0 = Array.isArray(vmArgs[0]) ? vmArgs[0].slice(0, 60) : String(vmArgs[0]).substring(0, 60);
          if (vmArgs.length > 2) results.arg2 = Array.isArray(vmArgs[2]) ? vmArgs[2].slice(0, 24) : String(vmArgs[2]).substring(0, 60);
        }

        // hook push + slice + concat
        var O_PUSH = Array.prototype.push;
        var O_SLICE = Array.prototype.slice;
        var O_CONCAT = Array.prototype.concat;
        var records = results.records;
        function copyArr(a, max) { var c = []; var n = Math.min(a.length, max||88); for (var i=0;i<n;i++) O_PUSH.call(c, a[i]); return c; }
        function rec(tag, arr, stack) {
          O_PUSH.call(records, { tag: tag, len: arr.length, content: copyArr(arr, 88), stack: stack.substring(0, 2000) });
        }
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

        // 重新调用 dispatcher 从 PC 0 重放
        results.replayStart = Date.now();
        try {
          var r = disp(vmCtx, 0, endPC, vmArgs);
          results.replayReturn = typeof r;
        } catch(e) {
          results.replayErr = e.message.substring(0, 200);
        }
        results.replayDone = true;
        results.replayMs = Date.now() - results.replayStart;

        // 恢复
        Array.prototype.push = O_PUSH;
        Array.prototype.slice = O_SLICE;
        Array.prototype.concat = O_CONCAT;
      } catch(e) {
        results.err = e.message + ' | ' + (e.stack || '').substring(0, 300);
      }
      return JSON.stringify(results);
    })()`;

    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f1.callFrameId, expression: expr, returnByValue: true });
      const val = r.result?.value;
      if (typeof val === 'string' && val.startsWith('{')) {
        const fname = path.join(OUT, 'replay_' + Date.now() + '.json');
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
  await new Promise(r => setTimeout(r, 5000));
  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 超时'); process.exit(2); }, 220000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
