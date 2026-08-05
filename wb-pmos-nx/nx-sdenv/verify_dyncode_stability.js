// 验证 dynCode 文本固定性：本地固定 challenge（127.0.0.1:8080, nsd=67402）多次截获对比
const fs = require('fs');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = '/tmp/nx_dyncode_stability.json';

(async () => {
  const origRun = vm.runInContext;
  const dynCodes = [];
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0) {
        dynCodes.push(code);
        console.log('[STAB] ★ 截获 dynCode len=' + code.length + ' #' + dynCodes.length);
      }
    } catch (e) {}
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: LOCAL_PROXY,
    consoleConfig: { error: new Function() },
  });
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  console.log('[STAB] dynCode 截获数:', dynCodes.length);
  // 对比多个
  for (let i = 0; i < dynCodes.length; i++) {
    for (let j = i + 1; j < dynCodes.length; j++) {
      const same = dynCodes[i] === dynCodes[j];
      console.log('[STAB] #' + i + ' vs #' + j + ' 相同: ' + same);
      if (!same) {
        for (let k = 0; k < Math.min(dynCodes[i].length, dynCodes[j].length); k++) {
          if (dynCodes[i][k] !== dynCodes[j][k]) {
            console.log('[STAB]   差异@' + k + ': A=' + JSON.stringify(dynCodes[i].slice(k, k + 60)) + ' B=' + JSON.stringify(dynCodes[j].slice(k, k + 60)));
            break;
          }
        }
      }
    }
  }
  // 与历史 captured_2 对比
  if (dynCodes.length && fs.existsSync('/tmp/nx_dynCode_captured_2.js')) {
    const hist = fs.readFileSync('/tmp/nx_dynCode_captured_2.js', 'utf8');
    const normA = dynCodes[0].replace('globalThis.$_ts', '$_ts');
    const normB = hist.replace('globalThis.$_ts', '$_ts');
    console.log('[STAB] vs captured_2: ' + (normA === normB ? '文本固定 ✓' : '不同 len=' + normA.length + ' vs ' + normB.length));
    if (normA !== normB) {
      for (let k = 0; k < Math.min(normA.length, normB.length); k++) {
        if (normA[k] !== normB[k]) { console.log('[STAB]   差异@' + k + ': A=' + JSON.stringify(normA.slice(k, k + 60)) + ' B=' + JSON.stringify(normB.slice(k, k + 60))); break; }
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ count: dynCodes.length, lens: dynCodes.map(d => d.length) }));
  console.log('[STAB] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[STAB] FATAL:', e && e.message); process.exit(1); });
