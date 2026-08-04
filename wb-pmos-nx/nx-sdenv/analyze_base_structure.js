// 解密 sdenv cookie 的 P 部分，对比固定 nsd/cd 下两次 base 的确定性
// 目标：找出 cookie 的稳定结构段（算法）vs 变化段（随机/环境）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

// 复用管线解码模块
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const _gv = require('@src/handler/globalVarible');
_gv._setAttr('basestr', "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^");
require('@src/handler/parser/constData').init();
const basestr = require('@src/handler/parser/common/basestr');
const numarr2string = require('@src/handler/parser/common/numarr2string');

async function genCookieOnce(nsd, cd) {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const { window, cookieJar } = dom;
  window.$_ts.nsd = nsd;
  window.$_ts.cd = cd;
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const c = cookieJar.getCookieStringSync(B + '/');
      if ((c.includes('O=') && c.includes('P=')) || Date.now() - t0 > 30000) {
        clearInterval(iv);
        resolve(c);
      }
    }, 500);
  });
  window.close();
  return cookies;
}

(async () => {
  console.log('=== base 结构确定性分析 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('固定 nsd:', nsd);

  const c1 = await genCookieOnce(nsd, cd);
  const c2 = await genCookieOnce(nsd, cd);
  const p1 = c1.split(';').map(s => s.trim());
  const p2 = c2.split(';').map(s => s.trim());
  const P1 = p1[1].split('=')[1];
  const P2 = p2[1].split('=')[1];

  // 用 basestr 解码 cookie（cookie 是 numarr2string 编码）
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^".split('');
  const dec1 = basestr.decode(P1, bs);
  const dec2 = basestr.decode(P2, bs);
  console.log('\nP 解码字节数:', dec1.length, dec2.length);
  console.log('完全一致:', dec1.join(',') === dec2.join(','));

  // 找稳定段（相同区域）
  const len = Math.min(dec1.length, dec2.length);
  const stableSegs = [];
  let segStart = -1;
  for (let i = 0; i < len; i++) {
    if (dec1[i] === dec2[i]) {
      if (segStart < 0) segStart = i;
    } else {
      if (segStart >= 0) { stableSegs.push([segStart, i - 1]); segStart = -1; }
    }
  }
  if (segStart >= 0) stableSegs.push([segStart, len - 1]);
  console.log('\n稳定段（相同字节区）:');
  stableSegs.forEach(([s, e]) => {
    console.log(`  [${s}:${e}] len=${e - s + 1}: ${dec1.slice(s, Math.min(e + 1, s + 30)).map(b => b.toString(16).padStart(2, '0')).join(' ')}${e - s + 1 > 30 ? '...' : ''}`);
  });
  console.log('\n变化段:');
  const diffSegs = [];
  for (let i = 0; i < len; i++) {
    if (dec1[i] !== dec2[i]) {
      diffSegs.push(i);
    }
  }
  // 分组变化区
  let dStart = -1;
  for (const i of diffSegs) {
    if (dStart < 0) dStart = i;
    if (i - dStart > 1) { console.log(`  [${dStart}:${i - 1}] len=${i - dStart}`); dStart = -1; }
  }
  if (dStart >= 0) console.log(`  [${dStart}:${len - 1}]`);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
