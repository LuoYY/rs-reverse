// 决定性：本地固定（nsd=67402）下两次运行 _$ez 是否相同？
// 相同 → base 确定性（f(cd) 纯函数）；不同 → 含随机/时间
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

async function runOnce(seed) {
  let ezs = null;
  const flag = '__ezF' + seed;
  const key = '__ezSnap' + seed;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0) {
      // 每次都插桩（每次 jsdom 独立 vm context）
      let c = code;
      const retTarget = 'return _$hF.apply(this,_$eS);';
      if (c.indexOf(retTarget) >= 0) {
        const inject = `try{if(globalThis.${flag}===undefined){globalThis.${flag}=true;globalThis.${key}=(typeof _$ez!=="undefined")?(Array.isArray(_$ez)?Array.from(_$ez):(typeof _$ez==="string"?Array.from(_$ez).map(function(x){return x.charCodeAt(0);}):null)):null;}}catch(__e){globalThis.__ezE${seed}=String(__e);}` + retTarget;
        c = c.split(retTarget).join(inject);
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
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  try { ezs = w.eval(`typeof ${key}!=="undefined"?${key}:null`); } catch (e) {}
  const pLen = (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length;
  dom.window.close();
  return { ezs, pLen };
}

(async () => {
  console.log('[DZ] 本地固定确定性测试...');
  const r1 = await runOnce(1);
  console.log('[DZ] #1 P len=' + r1.pLen + ' ez=' + (r1.ezs ? r1.ezs.length : 'null'));
  await new Promise(r => setTimeout(r, 800));
  const r2 = await runOnce(2);
  console.log('[DZ] #2 P len=' + r2.pLen + ' ez=' + (r2.ezs ? r2.ezs.length : 'null'));
  if (r1.ezs && r2.ezs) {
    const same = JSON.stringify(r1.ezs) === JSON.stringify(r2.ezs);
    console.log('[DZ] 两次 _$ez 相同?', same);
    if (!same) {
      // 找不同位置
      const m = Math.min(r1.ezs.length, r2.ezs.length);
      let diff = [];
      for (let i = 0; i < m; i++) if (r1.ezs[i] !== r2.ezs[i]) diff.push(i);
      console.log('[DZ] 不同位置(' + diff.length + '):', diff.slice(0, 30).join(','));
      console.log('[DZ] #1 @diff:', diff.slice(0, 5).map(i => r1.ezs[i]).join(','));
      console.log('[DZ] #2 @diff:', diff.slice(0, 5).map(i => r2.ezs[i]).join(','));
    }
  }
  process.exit(0);
})().catch(e => { console.error('[DZ] FATAL:', e && e.message); process.exit(1); });
