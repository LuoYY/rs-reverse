/**
 * 41_capture_query_encrypt.js
 *
 * 只对 query 加密（[165] 第一个参数 = 24B）断点：
 *   命中时用 evaluateOnCallFrame 完整提取 frame0（[165] 参数）和 frame1（VM 状态）
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
    console.log('  暂停 #' + pauseCount);

    // 检查 frame0 作用域是否有 24 长度数组（query 加密的第一个参数）
    let plain24 = null, key21 = null, argCount = 0;
    let len24Vars = [];
    for (const scope of f0.scopeChain) {
      if (!scope.object?.objectId) continue;
      const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
      for (const p of props.result) {
        if (p.value?.objectId) {
          try {
            const arr = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
            const elems = arr.result.filter(x => /^\d+$/.test(x.name)).map(x => x.value?.value);
            if (elems.length === 24 && elems.every(e => typeof e === 'number')) {
              len24Vars.push(p.name);
              plain24 = elems;
            }
            if (elems.length === 21 && elems.every(e => typeof e === 'number') && !key21) key21 = elems;
          } catch (e) {}
        }
        if (p.name === 'arguments' || p.name === 'length') argCount++;
      }
    }
    if (!plain24) { await cdp.send('Debugger.resume').catch(() => {}); return; }

    done = true;
    console.log('[3] ★ query 加密命中！plain24 var:', len24Vars.join(','));

    // 找 frame1 的 VM 上下文名（含 206 数组的对象）
    const f1 = params.callFrames[1];
    let vmCtxName = null;
    if (f1) {
      for (const scope of f1.scopeChain) {
        if (!scope.object?.objectId) continue;
        const props = await cdp.send('Runtime.getProperties', { objectId: scope.object.objectId, ownProperties: true });
        for (const p of props.result) {
          if (!p.value?.objectId) continue;
          if (p.value.description?.includes('Object')) {
            try {
              const p2 = await cdp.send('Runtime.getProperties', { objectId: p.value.objectId, ownProperties: true });
              for (const pp of p2.result) {
                if (pp.value?.description && /Array\(20\d\)/.test(pp.value.description)) { vmCtxName = p.name; break; }
              }
            } catch (e) {}
          }
          if (vmCtxName) break;
        }
        if (vmCtxName) break;
      }
    }
    console.log('  VM上下文:', vmCtxName);

    // 提取 frame1 VM 状态 + frame0 参数
    const f1 = params.callFrames[1];
    let vmCtxName = null, argsName = null;
    if (f1) {
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
    }

    const expr = `(function(){
      var safe = function(v, depth) {
        if (depth > 3) return 'MAXDEPTH';
        if (v === null) return null;
        var t = typeof v;
        if (t === 'number' || t === 'string' || t === 'boolean' || v === undefined) return v;
        if (t === 'function') return 'fn';
        if (Array.isArray(v)) {
          var a = [];
          var n = Math.min(v.length, 40);
          for (var i = 0; i < n; i++) a.push(safe(v[i], depth + 1));
          return a;
        }
        var o = {};
        var ks = Object.keys(v);
        for (var j = 0; j < Math.min(ks.length, 20); j++) o[ks[j]] = safe(v[ks[j]], depth + 1);
        return o;
      };
      var out = { plain24: ${JSON.stringify(plain24)}, key21: ${JSON.stringify(key21)}, vmCtxName: ${JSON.stringify(vmCtxName)}, argsName: ${JSON.stringify(argsName)}, bytecode: null, args: null, err: null };
      try {
        var vmCtx = ${vmCtxName || 'undefined'};
        if (vmCtx) {
          out.vmCtxKeys = Object.keys(vmCtx);
          out.vmCtxAll = {};
          for (var k in vmCtx) {
            try {
              var x = vmCtx[k];
              if (Array.isArray(x)) { out.vmCtxAll[k] = x.slice(0, 400); if (x.length > 100 && x.every(function(y){return typeof y==='number';})) out.bytecode = x; }
              else out.vmCtxAll['t_' + k] = typeof x;
            } catch(e) { out.vmCtxAll['e_' + k] = e.message; }
          }
        }
        var args = ${argsName || 'undefined'};
        if (args) {
          out.args = [];
          for (var i = 0; i < args.length; i++) {
            try {
              var x = args[i];
              if (Array.isArray(x)) out.args.push({ t: 'arr', len: x.length, d: x.filter(function(z){return typeof z==='number';}).slice(0, 60) });
              else if (x && typeof x === 'object') out.args.push({ t: 'obj', keys: Object.keys(x).slice(0, 15) });
              else out.args.push({ t: typeof x, v: String(x).substring(0, 20) });
            } catch(e) { out.args.push({ t: 'ERR' }); }
          }
        }
      } catch(e) { out.err = e.message; }
      return JSON.stringify(out, function(k, v) { if (v && typeof v === 'object' && k) { try { JSON.stringify(v); return v; } catch(e) { return '[circular]'; } } return v; });
    })()`;

    try {
      const r = await cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: f1 ? f1.callFrameId : f0.callFrameId, expression: expr, returnByValue: true });
      const val = r.result?.value;
      if (typeof val === 'string' && val.startsWith('{')) {
        const fname = path.join(OUT, 'query_enc_' + Date.now() + '.json');
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
