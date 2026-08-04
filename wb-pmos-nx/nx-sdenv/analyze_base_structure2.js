// base 结构分析 v2：手动逆 numarr2string 解码 cookie P，对比固定 nsd/cd 的稳定段
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// numarr2string 逆过程：字符串 → 数字数组
function decodeNumarr(str, keys) {
  // 字符 → 索引
  const idxOf = {};
  keys.forEach((c, i) => idxOf[c] = i);
  const vals = [];
  for (const c of str) {
    if (idxOf[c] === undefined) continue;
    vals.push(idxOf[c]);
  }
  // 每 4 字符 → 3 字节
  const out = [];
  for (let i = 0; i + 3 < vals.length; i += 4) {
    const [a, b, c, d] = [vals[i], vals[i + 1], vals[i + 2], vals[i + 3]];
    out.push((a << 2) | (b >> 4));
    out.push(((b & 15) << 4) | (c >> 2));
    out.push(((c & 3) << 6) | d);
  }
  // 尾
  const rem = vals.length % 4;
  if (rem >= 2) {
    const i = vals.length - rem;
    const [a, b] = [vals[i], vals[i + 1]];
    out.push((a << 2) | (b >> 4));
    if (rem >= 3) out.push(((b & 15) << 4) | (vals[i + 2] >> 2));
  }
  return out;
}

const BS = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^".split('');

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
  console.log('=== base 结构确定性分析 v2 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('固定 nsd:', nsd, 'cd_len:', cd.length);

  const c1 = await genCookieOnce(nsd, cd);
  const c2 = await genCookieOnce(nsd, cd);
  const P1 = c1.split(';')[1].split('=')[1].trim();
  const P2 = c2.split(';')[1].split('=')[1].trim();
  const O1 = c1.split(';')[0].split('=')[1].trim();
  const O2 = c2.split(';')[0].split('=')[1].trim();

  const d1 = decodeNumarr(P1, BS);
  const d2 = decodeNumarr(P2, BS);
  console.log('\nP 解码字节数:', d1.length, d2.length);

  // 稳定段分析
  const len = Math.min(d1.length, d2.length);
  let segStart = -1;
  const stableSegs = [];
  for (let i = 0; i < len; i++) {
    if (d1[i] === d2[i]) { if (segStart < 0) segStart = i; }
    else { if (segStart >= 0) { stableSegs.push([segStart, i - 1]); segStart = -1; } }
  }
  if (segStart >= 0) stableSegs.push([segStart, len - 1]);
  console.log('\n=== 稳定段（两次相同）===');
  let stableTotal = 0;
  stableSegs.forEach(([s, e]) => {
    stableTotal += e - s + 1;
    const hex = d1.slice(s, Math.min(e + 1, s + 24)).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  [${s}:${e}] len=${e - s + 1}: ${hex}${e - s + 1 > 24 ? '...' : ''}`);
  });
  console.log(`稳定总字节: ${stableTotal}/${len}`);

  // 变化段
  console.log('\n=== 变化段（两次不同）===');
  const diffIdx = [];
  for (let i = 0; i < len; i++) if (d1[i] !== d2[i]) diffIdx.push(i);
  let ds = -1;
  for (const i of diffIdx) {
    if (ds < 0) ds = i;
    if (i - ds > 1) { console.log(`  [${ds}:${i - 1}] len=${i - ds} d1=${d1.slice(ds, i).join(',')}`); ds = -1; }
  }
  if (ds >= 0) console.log(`  [${ds}:${len - 1}] len=${len - ds} d1=${d1.slice(ds).join(',')}`);

  // 也对比 O
  console.log('\nO 解码字节数:', decodeNumarr(O1, BS).length, decodeNumarr(O2, BS).length);
  const o1 = decodeNumarr(O1, BS), o2 = decodeNumarr(O2, BS);
  console.log('O 完全一致:', o1.join(',') === o2.join(','));
  console.log('O 首 40:', o1.slice(0, 40).map(b => b.toString(16).padStart(2, '0')).join(' '));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
