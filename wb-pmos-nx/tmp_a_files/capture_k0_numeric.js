// 在 sdenv 中捕获正确数字类型的 _$k0 池 + 其他池
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://ericshi:583315@120.221.249.98:2018';

(async () => {
  const origRun = vm.runInContext;
  let dynCode = null;
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !dynCode) {
      dynCode = code;
      let c = code;
      // 捕获所有池（数字类型）：用类型感知序列化
      // _$k0 由 _\$nP(_\$ez) 生成，直接捕获运行时数组
      const mark = 'if(_$pW===1685){_$k0=_$nP(_$ez);}';
      if (c.indexOf(mark) >= 0) {
        const inj = `if(_$pW===1685){_$k0=_$nP(_$ez);try{var __p={k0:[],b1:[],lc:[],ll:[],f:[],oP:[],_L:[],q:[],_3:[],M:[],lC:[]};for(var __i=0;__i<_$k0.length;__i++)__p.k0.push({v:_$k0[__i],t:typeof _$k0[__i]});function __cap(arr,target){if(!arr)return;for(var j=0;j<arr.length;j++){var x=arr[j];target.push({v:x,t:typeof x});}}__cap(_$b1,__p.b1);__cap(_$lc,__p.lc);__cap(_$ll,__p.ll);__cap(_$f$,__p.f);__cap(_$oP,__p.oP);__cap(_$_L,__p._L);__cap(_$$q,__p.q);__cap(_$_3,__p._3);__cap(_$$M,__p.M);__cap(_$lC,__p.lC);window.__pools=__p;}catch(__e){window.__pE=String(__e);}}`;
        c = c.split(mark).join(inj);
        console.log('[KN] op1685 插桩 OK');
      } else {
        // 找其他 _\$k0= 赋值点
        const k0p = c.indexOf('_$k0=_$nP(_$ez)');
        console.log('[KN] op1685 未找到, _$k0=_$nP @' + k0p);
      }
      code = c;
    }
    return origRun(code, ctx, opts);
  };

  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
        lastLen = pLen;
        if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const poolsRaw = ev('typeof __pools!=="undefined"?__pools:null');
  const pE = ev('typeof __pE!=="undefined"?__pE:null');
  console.log('[KN] pools:', poolsRaw ? 'yes' : 'null', 'err:', pE);
  if (poolsRaw && poolsRaw !== 'null') {
    // 提取纯值数组
    const p = {};
    for (const k of ['k0','b1','lc','ll','f','oP','_L','q','_3','M','lC']) {
      const arr = poolsRaw[k];
      if (Array.isArray(arr)) {
        p[k] = arr.map(x => x.v);
      }
    }
    console.log('[KN] k0 len:', p.k0.length, 'k0[35]:', p.k0[35], 'typeof:', typeof p.k0[35]);
    console.log('[KN] b1 len:', p.b1.length, 'oP len:', p.oP.length);
    fs.writeFileSync(path.join(__dirname, 'nx_pools_numeric.json'), JSON.stringify(p));
    console.log('[KN] 已保存 nx_pools_numeric.json');
  }
  const P = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=([^;]*)/) || [])[1];
  console.log('[KN] P len:', P ? P.length : 0);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[KN] FATAL:', e.message); process.exit(1); });
