/**
 * 43_get_global103.js
 *
 * 定位到 plain24 由 global[103] 构造。
 * 在 [165] 断点（query 加密）时，用 evaluateOnCallFrame 读取 global[103] 及
 * 相关函数源码（global[123]/[157]/[221]/[165]），分析 prefix 构造逻辑。
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
  let pauseCount = 0;
  cdp.on('Debugger.paused', async (params) => {
    pauseCount++;
    if (done) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    const f0 = params.callFrames[0];
    if (!f0) { await cdp.send('Debugger.resume').catch(() => {}); return; }

    // 检查是否 query 加密（frame0 有 24 数组）
    let isQuery = false;
    for (const scope of f0.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (p.value?.objectId) {
          try {
            const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
            const elems = arr.result.filter(x => /^\d+$/.test(x.name)).map(x => x.value?.value);
            if (elems.length === 24 && elems.every(e => typeof e === 'number')) isQuery = true;
          } catch (e) {}
        }
      }
    }
    if (!isQuery) { await cdp.send('Debugger.resume').catch(() => {}); return; }
    done = true;
    console.log('[3] ★ query 加密命中');

    // 找 frame1 的 global 数组（488 元素）
    const f1 = params.callFrames[1];
    let globalArrName = null;
    if (f1) {
      for (const scope of f1.scopeChain) {
        if (!scope.object?.objectId) continue;
        const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
        for (const p of props.result) {
          if (p.value?.description && /Array\(48\d\)/.test(p.value.description)) globalArrName = p.name;
        }
      }
    }
    console.log('  global 数组:', globalArrName);

    // 用 evaluateOnCallFrame 读取 VM 上下文完整内容 + global[103] 等
    const expr = `(function(){
      var out = { err: null, fnName: (arguments.callee ? arguments.callee.name : '?') };
      try {
        // VM 上下文：当前 dispatcher 的第一参数（含字节码数组）
        var vmCtx = arguments[0];
        if (vmCtx && typeof vmCtx === 'object') {
          out.vmCtxKeys = [];
          out.vmCtxArrays = {};
          for (var k in vmCtx) {
            out.vmCtxKeys.push(k);
            try {
              var x = vmCtx[k];
              if (Array.isArray(x)) out.vmCtxArrays[k] = x.slice(0, 400);
              else out.vmCtxArrays['type_' + k] = typeof x;
            } catch(e) { out.vmCtxArrays['err_' + k] = e.message; }
          }
        } else {
          out.vmCtxErr = 'arg0 is ' + typeof vmCtx;
        }
        var g = ${globalArrName || 'undefined'};
        if (g) {
          out.globalLen = g.length;
          out.entries = {};
          var idxList = [103, 123, 157, 221, 165, 151, 61, 65, 75, 88, 78];
          for (var ii = 0; ii < idxList.length; ii++) {
            var idx = idxList[ii];
            try {
              var v = g[idx];
              if (typeof v === 'function') { var src = Function.prototype.toString.call(v); out.entries[idx] = { type: 'fn', len: src.length, src: src.substring(0, 2500) }; }
              else if (Array.isArray(v)) out.entries[idx] = { type: 'arr', len: v.length, d: v.slice(0, 40) };
              else out.entries[idx] = { type: typeof v, v: String(v).substring(0, 80) };
            } catch(e) { out.entries[idx] = { err: e.message }; }
          }
        }
      } catch(e) { out.err = e.message; }
      return JSON.stringify(out, function(k, v) { if (v && typeof v === 'object' && k && k !== 'src' && k !== 'd') { try { JSON.stringify(v); return v; } catch(e) { return '[circ]'; } } return v; });
    })()`;
          out.globalLen = g.length;
          out.entries = {};
          for (var idx of [103, 123, 157, 221, 165, 151, 61, 65]) {
            try {
              var v = g[idx];
              if (typeof v === 'function') {
                var src = Function.prototype.toString.call(v);
                out.entries[idx] = { type: 'fn', len: src.length, src: src.substring(0, 3000) };
              } else if (Array.isArray(v)) {
                out.entries[idx] = { type: 'arr', len: v.length, d: v.slice(0, 40) };
              } else {
                out.entries[idx] = { type: typeof v, v: String(v).substring(0, 100) };
              }
            } catch(e) { out.entries[idx] = { err: e.message }; }
          }
          // 也找 nextarr/keys2：扫描 global 里 48 长度数组
          out.k48 = [];
          for (var i = 0; i < g.length; i++) {
            try { if (Array.isArray(g[i]) && g[i].length === 48) out.k48.push({ idx: i, d: g[i].slice(0, 16) }); } catch(e) {}
          }
        }
      } catch(e) { out.err = e.message; }
      return JSON.stringify(out, function(k, v) { if (v && typeof v === 'object' && k && k !== 'src' && k !== 'd') { try { JSON.stringify(v); return v; } catch(e) { return '[circ]'; } } return v; });
    })()`;

    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f1.callFrameId, expression: expr, returnByValue: true });
      const val = r.result?.value;
      if (typeof val === 'string' && val.startsWith('{')) {
        const fname = path.join(OUT, 'global103_' + Date.now() + '.json');
        fs.writeFileSync(fname, val);
        console.log('  已保存:', fname);
      } else {
        console.log('  异常:', JSON.stringify(r).substring(0, 300));
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
