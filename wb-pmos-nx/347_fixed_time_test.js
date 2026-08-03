/**
 * 347_fixed_time_test.js
 * 假设：key21 的 time4 必须 = P cookie 的会话时间戳（nextarr X 段）
 * 测：key21 time 固定为 X 提取的 T → getGatewayConfig 连续 2 次
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

function makeDecryptKeys(bs) {
  return bs.split('').reduce((ans, key, idx) => {
    const code = key.charCodeAt();
    ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
    ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
    ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
    return ans;
  }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
}
function decryptCd(cd) {
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
function deriveKeys(cdArr) {
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
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
  for (let k0 = 0; k0 <= 127; k0++) {
    for (let k1 = 0; k1 <= 127; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      if (ans.some(v => v > 255)) continue;
      const keys = [];
      let op = 1, gap, ok = true;
      for (let i = 0; i < ans[0]; i++) {
        [gap, op] = getLensGo(ans, op);
        if (gap < 0 || op + gap > ans.length) { ok = false; break; }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if (!ok) continue;
      const k16 = keys[16];
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) return { off, keys };
    }
  }
  return null;
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
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const challenges = [];
  let pCookie = '', pName = '', oCookie = null;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    page.on('response', async (resp) => {
      if (resp.status() === 412) {
        try {
          const body = await resp.text();
          const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
          const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
          if (nsdM && cdM) challenges.push({ nsd: +nsdM[1], cd: cdM[1] });
        } catch (e) {}
      }
    });
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(8000);
    try { await page.reload({ timeout: 90000 }); } catch (e) {}
    await page.waitForTimeout(20000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    console.log('标题:', await page.evaluate(() => document.title).catch(() => ''), '412:', challenges.length);
    const ch = challenges[challenges.length - 1];
    const cdArr = decryptCd(ch.cd);
    const der = deriveKeys(cdArr);
    const pureK17 = der.keys[17];
    const C = decodeB86(pCookie.slice(1));
    const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = encryptMode2([...C], arr, 1);
    const origNextarr = dec.slice(4);
    const browserK2 = origNextarr.slice(11, 59);
    // X 8B = nextarr[2..9]
    const X = origNextarr.slice(2, 10);
    const T = (X[0] << 24) | (X[1] << 16) | (X[2] << 8) | X[3];
    console.log('keys2:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('X 8B:', X.map(b => b.toString(16).padStart(2, '0')).join(' '), 'T:', T, '=', new Date(T * 1000).toISOString());
    console.log('当前时间:', Math.floor(Date.now() / 1000));

    const randByte = () => Math.floor(Math.random() * 256);
    function genQuery(urlPath, timeVal) {
      const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
      const plain24 = [
        browserK2[0] ^ MASK[0], browserK2[1] ^ MASK[1], browserK2[2] ^ MASK[2], browserK2[3] ^ MASK[3],
        browserK2[4] ^ MASK[4], browserK2[5] ^ MASK[5], browserK2[6] ^ MASK[6], browserK2[7] ^ MASK[7],
        randByte(), randByte(), randByte(), randByte(), randByte(),
        randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
        (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
      ];
      const [key21] = numarrAddTime([...pureK17], timeVal, Math.random());
      const requestData = encryptMode1(plain24, key21, 0);
      const body = [4, 0, 48, ...browserK2, 32, ...requestData];
      const crc = crc32b(Buffer.from(body));
      return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64.split(''));
    }

    const API = '/px-gateway/GatewayConfig/getGatewayConfig';
    async function fetchQ(uq, hq) {
      return await page.evaluate(async ({ api, uq, hq }) => {
        const r = await fetch(api + '?' + uq, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', 'ClientTag': 'OUTNET_BROWSE', 'CurrentRoute': '/outNet', 'MurR7rxG': hq }, body: '{}' });
        const t = await r.text();
        return { s: r.status, b: t.substring(0, 40) };
      }, { api: API, uq, hq });
    }

    console.log('\n=== A: key21 time 固定 T（会话时间戳）===');
    for (let i = 1; i <= 2; i++) {
      const r = await fetchQ(genQuery(API, T), genQuery(API, T));
      console.log('  #' + i + ':', r.s, r.b.replace(/\n/g, ' ').substring(0, 30));
    }
    console.log('\n=== B: key21 time = T+1 ===');
    for (let i = 1; i <= 2; i++) {
      const r = await fetchQ(genQuery(API, T + 1), genQuery(API, T + 1));
      console.log('  #' + i + ':', r.s, r.b.replace(/\n/g, ' ').substring(0, 30));
    }
    console.log('\n=== C: key21 time = 当前时间 ==（对照）===');
    for (let i = 1; i <= 2; i++) {
      const r = await fetchQ(genQuery(API, Math.floor(Date.now() / 1000)), genQuery(API, Math.floor(Date.now() / 1000)));
      console.log('  #' + i + ':', r.s, r.b.replace(/\n/g, ' ').substring(0, 30));
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
