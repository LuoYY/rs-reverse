// 同会话捕获完整 VM 输入：scj + aebi + _$ez + _$k0 + 其他常量池 + P cookie
// 供纯 Node vm 执行 dynCode（符号执行器）使用
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[CV] pid=' + process.pid);
  const origRun = vm.runInContext;
  let dynCode = null;
  const capTs = {};
  vm.runInContext = function (code, ctx, opts) {
    try {
      // 从 vm context 捕获 $_ts（dynCode 执行时 $_ts 还在）
      try {
        if (!capTs.scj && ctx && ctx.$_ts) {
          capTs.nsd = ctx.$_ts.nsd;
          capTs.cd = typeof ctx.$_ts.cd === 'string' ? ctx.$_ts.cd : String(ctx.$_ts.cd || '');
          capTs.scj = ctx.$_ts.scj;
          capTs.aebi = ctx.$_ts.aebi;
          console.log('[CV] $_ts 捕获: nsd=' + capTs.nsd + ' scj=' + (capTs.scj ? 'yes' : 'null') + ' aebi=' + (capTs.aebi ? 'yes' : 'null'));
        }
      } catch (e) { console.log('[CV] $_ts 捕获 err:', e.message); }
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !dynCode) {
        dynCode = code;
        console.log('[CV] ★ 截获 dynCode len=' + code.length);
        // 在 _$g1 记录 ktFinal，在 _$c4 返回点记录 _$ez
        let c = code;
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inj2 = 'function _$g1(){try{window.__ktF=Array.isArray(_$kt)?Array.from(_$kt):null;}catch(__e){}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inj2);
          console.log('[CV] _$g1 注入 OK');
        }
        const retTarget = 'return _$hF.apply(this,_$eS);';
        if (c.indexOf(retTarget) >= 0) {
          const inj3 = `try{if(window.__ezD===undefined){window.__ezD=Array.isArray(_$ez)?Array.from(_$ez):(typeof _$ez==="string"?Array.from(_$ez).map(function(x){return x.charCodeAt(0);}):null);}}catch(__e){window.__ezE=String(__e);}` + retTarget;
          c = c.split(retTarget).join(inj3);
          console.log('[CV] _$ez 捕获注入 OK');
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[CV] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        if (!capTs.cd && w.$_ts && w.$_ts.cd) { capTs.nsd = w.$_ts.nsd; capTs.cd = typeof w.$_ts.cd === 'string' ? w.$_ts.cd : String(w.$_ts.cd); capTs.scj = w.$_ts.scj; capTs.aebi = w.$_ts.aebi; }
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
        lastLen = pLen;
        if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const out = {
    nsd: capTs.nsd || null,
    cd: capTs.cd || null,
    scj: capTs.scj !== undefined ? (Array.isArray(capTs.scj) ? capTs.scj : capTs.scj) : null,
    aebi: capTs.aebi !== undefined ? capTs.aebi : null,
    ktFinal: ev('typeof __ktF!=="undefined"?JSON.stringify(__ktF):null'),
    ez: ev('typeof __ezD!=="undefined"?JSON.stringify(__ezD):null'),
    Pval: (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1] || null,
    Oval: (dom.cookieJar.getCookieStringSync(B + '/').match(/O=([^;]*)/) || [])[1] || null,
  };
  // JSON 安全化
  for (const k of ['scj', 'aebi', 'ktFinal', 'ez']) {
    if (out[k] === 'ERR:' || out[k] === null) { console.log('[CV] ' + k + ' 捕获失败:', String(out[k]).slice(0, 80)); }
    else if (typeof out[k] === 'string') { try { out[k] = JSON.parse(out[k]); } catch (e) {} }
    if (Array.isArray(out[k])) console.log('[CV] ' + k + ' len=' + out[k].length);
  }
  if (out.aebi && Array.isArray(out.aebi)) console.log('[CV] aebi[1] len=' + (out.aebi[1] || []).length);
  console.log('[CV] nsd=' + out.nsd + ' cd_len=' + (out.cd || '').length + ' P_len=' + (out.Pval || '').length);
  fs.writeFileSync(path.join(__dirname, 'nx_vm_full_inputs.json'), JSON.stringify(out));
  console.log('[CV] 已保存 nx_vm_full_inputs.json');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CV] FATAL:', e && e.stack); process.exit(1); });
