// 同会话捕获 _$k0 + 字符串池（_$b1/_$lc/_$ll/_$f$ 等）+ scj/aebi/ez
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
  console.log('[CP] pid=' + process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  const capTs = {};
  vm.runInContext = function (code, ctx, opts) {
    try {
      try {
        if (!capTs.scj && ctx && ctx.$_ts) {
          capTs.nsd = ctx.$_ts.nsd;
          capTs.cd = typeof ctx.$_ts.cd === 'string' ? ctx.$_ts.cd : String(ctx.$_ts.cd || '');
          capTs.scj = ctx.$_ts.scj;
          capTs.aebi = ctx.$_ts.aebi;
        }
      } catch (e) {}
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4(') >= 0 && !patched) {
        patched = true;
        console.log('[CP] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩 op=1685：_$k0=_$nP(_$ez); 后捕获所有池
        const t1685 = 'if(_$pW===1685){_$k0=_$nP(_$ez);}';
        if (c.indexOf(t1685) >= 0) {
          const inj = `if(_$pW===1685){_$k0=_$nP(_$ez);try{window.__pools={k0:Array.isArray(_$k0)?Array.from(_$k0):null,b1:typeof _$b1!=="undefined"?_$b1:null,lc:typeof _$lc!=="undefined"?_$lc:null,ll:typeof _$ll!=="undefined"?_$ll:null,f:typeof _$f$!=="undefined"?_$f$:null,oP:typeof _$oP!=="undefined"?_$oP:null,_L:typeof _$_L!=="undefined"?_$_L:null,q:typeof _$$q!=="undefined"?_$$q:null,_3:typeof _$_3!=="undefined"?_$_3:null,M:typeof _$$M!=="undefined"?_$$M:null,lC:typeof _$lC!=="undefined"?_$lC:null,ez:Array.isArray(_$ez)?Array.from(_$ez):null};}catch(__e){window.__pE=String(__e);}}`;
          c = c.split(t1685).join(inj);
          console.log('[CP] op=1685 插桩 OK');
        } else console.log('[CP] ✗ op=1685 未找到');
        // 捕获 ktFinal（编码后）
        const g1Target = 'function _$g1(){_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
        if (c.indexOf(g1Target) >= 0) {
          const inj2 = 'function _$g1(){try{window.__ktF=Array.isArray(_$kt)?Array.from(_$kt):null;}catch(__e){}_$cV>_$l2?_$l2=_$cV:0;return _$cV;}';
          c = c.split(g1Target).join(inj2);
        }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_pools_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[CP] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const pools = ev('typeof __pools!=="undefined"?JSON.stringify(__pools):null');
  const kt = ev('typeof __ktF!=="undefined"?JSON.stringify(__ktF):null');
  console.log('[CP] pools:', pools ? 'yes' : 'null', 'err:', ev('typeof __pE!=="undefined"?__pE:null'));
  if (pools) {
    const d = JSON.parse(pools);
    console.log('[CP] k0 len:', d.k0 ? d.k0.length : 0);
    console.log('[CP] b1:', typeof d.b1 === 'string' ? d.b1.slice(0, 30) : d.b1);
    console.log('[CP] ll:', typeof d.ll === 'string' ? d.ll.slice(0, 30) : d.ll);
    console.log('[CP] ez len:', d.ez ? d.ez.length : 0);
    const out = { pools: d, ktFinal: kt ? JSON.parse(kt) : null, scj: capTs.scj, aebi: capTs.aebi, nsd: capTs.nsd, cd: capTs.cd };
    fs.writeFileSync(path.join(__dirname, 'nx_pools_same.json'), JSON.stringify(out));
    console.log('[CP] saved nx_pools_same.json, aebi[1] len:', capTs.aebi ? capTs.aebi[1].length : 0);
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CP] FATAL:', e && e.stack); process.exit(1); });
