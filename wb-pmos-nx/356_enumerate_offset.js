/**
 * 356_enumerate_offset.js
 * 枚举所有满足 keys[16]==K16 的 offset 解 → 用 keys[7] 可读性（分号资源名）筛选 → keys[2] 对比浏览器
 * 若筛选出正确解且 keys[2] 匹配 → nx keys2 纯算法可行（之前 offset 推导不唯一/不完整）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCdStr(cd) {
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const arr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr.push(d1[one] | d2[two]);
    three !== undefined && arr.push(d3[two] | d4[three]);
    four !== undefined && arr.push(d5[three] | d6[four]);
  }
  return arr;
}
function getLensGo(numarr, idx) {
  const item = numarr[idx]; idx++;
  let lens;
  if ((item & 128) === 0) lens = item;
  else if ((item & 192) === 128) { lens = ((item & 63) << 8) | numarr[idx]; idx++; }
  else if ((item & 224) === 192) { lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx + 1]; idx += 2; }
  else if ((item & 240) === 224) { lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx + 1] << 8) | numarr[idx + 2]; idx += 3; }
  else if ((item & 248) === 240) { lens = (numarr[idx] << 24) | (numarr[idx + 1] << 16) | (numarr[idx + 2] << 8) | numarr[idx + 3]; idx += 4; }
  else lens = item;
  return [lens, idx];
}
function genKeysSim(ans, step) {
  const keys = [];
  let op = 1, gap;
  try {
    for (let i = 0; i < ans[0]; i++) {
      if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
      else { [gap, op] = getLensGo(ans, op); }
      if (gap < 0 || op + gap > ans.length) return null;
      keys.push(ans.slice(op, op + gap));
      op += gap;
    }
  } catch (e) { return null; }
  return keys;
}
function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}
function ascii2string(arr) {
  return arr.map(b => String.fromCharCode(b)).join('');
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let nsd = null, cd = null, pCookie = '';
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' } });
    const page = await context.newPage();
    let ch1 = null;
    page.on('response', async (resp) => {
      if (resp.status() === 412 && !ch1) {
        try {
          const body = await resp.text();
          const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
          const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
          if (nsdM && cdM) ch1 = { nsd: +nsdM[1], cd: cdM[1] };
        } catch (e) {}
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) pCookie = pc.value;
    if (!ch1) { console.log('无挑战'); process.exit(1); }
    nsd = ch1.nsd; cd = ch1.cd;
    console.log('nsd=' + nsd + ' cdLen=' + cd.length);
    await context.close();
  } finally { await browser.close(); }

  // 浏览器 keys2
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const C = decodeB86(pCookie.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const browserK2 = dec.slice(15, 63);
  console.log('浏览器 keys2:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  const cdArr = decryptCdStr(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);

  // 枚举所有 offset 解（k0,k1 0-255）
  const solutions = [];
  for (let k0 = 0; k0 <= 255; k0++) {
    for (let k1 = 0; k1 <= 255; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      for (const step of [1, 2]) {
        const keys = genKeysSim(ans, step);
        if (!keys) continue;
        if (keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i])) {
          solutions.push({ k0, k1, step, keys });
        }
      }
    }
  }
  console.log('\n找到解数量:', solutions.length);
  // 用 keys[7] 可读性筛选
  const readable = solutions.filter(s => {
    const k7 = s.keys[7];
    if (!k7) return false;
    const str = ascii2string(k7);
    return str.includes(';') && /^[A-Za-z0-9_;\-]+$/.test(str);
  });
  console.log('keys[7] 可读解:', readable.length);
  readable.slice(0, 5).forEach(s => {
    console.log(`  k0=${s.k0} k1=${s.k1} step=${s.step} keys7="${ascii2string(s.keys[7]).substring(0, 60)}"`);
    console.log(`    keys2: ${s.keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')} 与浏览器相同: ${s.keys[2].every((v, i) => v === browserK2[i])}`);
  });
  // 全部可读解的 keys[2] 唯一性
  if (readable.length) {
    const k2set = new Set(readable.map(s => s.keys[2].join(',')));
    console.log('可读解 keys[2] 唯一值数:', k2set.size);
  }
  // 打印 keys[0]/keys[1]（xj 的 [54,52]）
  if (readable.length) {
    const s0 = readable[0];
    console.log('keys[0]:', s0.keys[0], 'keys[1]:', s0.keys[1], 'keys[7] param:', ascii2string(s0.keys[7]).split(';')[1]);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
