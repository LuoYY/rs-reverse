// 单次详细采集：逐步定位错误
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const ROOT = path.join(__dirname, '..', '..');
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData.js')).init();
const parser = require(path.join(ROOT, 'src/handler/parser/index.js'));

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

console.log('[DT] start');
(async () => {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  let capTs = null;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        if (!capTs && w.$_ts && w.$_ts.cd) capTs = { nsd: w.$_ts.nsd, cd: w.$_ts.cd };
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); return; }
        lastLen = pLen;
        if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 300);
  });
  const c = dom.cookieJar.getCookieStringSync(B + '/');
  const Pval = (c.match(/P=([^;]*)/) || [])[1];
  console.log('[DT] nsd:', capTs ? capTs.nsd : 'N/A', 'cdLen:', capTs ? capTs.cd.length : 0, 'P:', Pval ? Pval.slice(0, 10) : 'N/A');
  try {
    // 1. deriveKeys
    const cd = capTs.cd;
    const idxmap = {};
    NX_BS.split('').forEach((k, i) => { idxmap[k] = i; });
    const cdArr = [];
    for (let i = 0; i < cd.length; i += 4) {
      const one = cd[i], two = cd[i + 1], three = cd[i + 2], four = cd[i + 3];
      if (two) cdArr.push((idxmap[one] << 2) | (idxmap[two] >> 4));
      if (three) cdArr.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2));
      if (four) cdArr.push(((idxmap[three] & 3) << 6) | idxmap[four]);
    }
    console.log('[DT] cdArr len:', cdArr.length);
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    console.log('[DT] tail len:', tail.length, 'head:', tail.slice(0, 8).join(','));
    // deriveOffset
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    console.log('[DT] off0,1,4,7:', off0, off1, off4, off7);
  } catch (e) {
    console.log('[DT] deriveKeys ERR:', e.message);
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[DT] FATAL:', e.message); process.exit(1); });
