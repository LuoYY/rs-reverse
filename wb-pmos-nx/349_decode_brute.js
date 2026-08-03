/**
 * 349_decode_brute.js
 * 实现 JS 管线 encryptMode1 的逆（decode，用 gv.cfgnum[1] 逆表）
 * ① 往返验证（加密→解密→还原明文）② 暴力 ele+time 解密浏览器自动 request_data → 看真实明文
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

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const gv = require('@src/handler/globalVarible');
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const combine4 = require('@src/handler/parser/common/combine4');
  const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');

  // ==== getCfg 复制自 modeEncrypt（读取 gv.cfgnum）====
  function getCfg(numarr) {
    const ret = combine4(numarr.length % 16 !== 0 ? numarrAddTime.reverse(numarr)[0] : numarr);
    const cfgnum_0_4 = gv.cfgnum[0][4];
    const len = ret.length;
    const arr = [];
    let i, j, temp;
    for (i = len, j = 1; i < 4 * len + 28; i++) {
      temp = ret[i - 1];
      if (i % len === 0 || len === 8 && i % len === 4) {
        temp = cfgnum_0_4[temp >>> 24] << 24 ^ cfgnum_0_4[temp >> 16 & 255] << 16 ^ cfgnum_0_4[temp >> 8 & 255] << 8 ^ cfgnum_0_4[temp & 255];
        if (i % len === 0) {
          temp = temp << 8 ^ temp >>> 24 ^ j << 24;
          j = j << 1 ^ (j >> 7) * 283;
        }
      }
      ret[i] = ret[i - len] ^ temp;
    }
    for (j = 0; i; j++, i--) {
      temp = ret[j & 3 ? i : i - 4];
      if (i <= 4 || j < 4) arr[j] = temp;
      else arr[j] = gv.cfgnum[1][0][cfgnum_0_4[temp >>> 24]] ^ gv.cfgnum[1][1][cfgnum_0_4[temp >> 16 & 255]] ^ gv.cfgnum[1][2][cfgnum_0_4[temp >> 8 & 255]] ^ gv.cfgnum[1][3][cfgnum_0_4[temp & 255]];
    }
    return [ret, arr];
  }

  // ==== decode（encryptMode1 flag=0 的逆，ECB）====
  const IT = gv.cfgnum[1]; // [IT0,IT1,IT2,IT3,IS]
  const IS = IT[4];
  function decodeBlock(cfg, cw) {
    // cw = 密文 4 uint32
    const list = cfg[0];
    let cursor = list.length; // 48
    // 逆最后轮（S-box 轮）
    let s1, s2, s3, s4;
    cursor -= 4;
    // 用字节级逆 S-box
    function dword(v, k) {
      const d = (v ^ k) >>> 0;
      return (IS[d >>> 24] << 24) ^ (IS[d >> 16 & 255] << 16) ^ (IS[d >> 8 & 255] << 8) ^ IS[d & 255];
    }
    // 逆向旋转：从 c0..c3 与 list[44..47] 求 s1..s4
    // 正向: c3=S[s4>>24]^S[s1>>16]^S[s2>>8]^S[s3]^list[47]（见注释推导）
    // 构造字节映射
    const d3 = (cw[3] ^ list[47]) >>> 0;
    const d2 = (cw[2] ^ list[46]) >>> 0;
    const d1 = (cw[1] ^ list[45]) >>> 0;
    const d0 = (cw[0] ^ list[44]) >>> 0;
    let B = {};
    B['s4b3'] = IS[d3 >>> 24]; B['s1b2'] = IS[d3 >> 16 & 255]; B['s2b1'] = IS[d3 >> 8 & 255]; B['s3b0'] = IS[d3 & 255];
    B['s3b3'] = IS[d2 >>> 24]; B['s4b2'] = IS[d2 >> 16 & 255]; B['s1b1'] = IS[d2 >> 8 & 255]; B['s2b0'] = IS[d2 & 255];
    B['s2b3'] = IS[d1 >>> 24]; B['s3b2'] = IS[d1 >> 16 & 255]; B['s4b1'] = IS[d1 >> 8 & 255]; B['s1b0'] = IS[d1 & 255];
    B['s1b3'] = IS[d0 >>> 24]; B['s2b2'] = IS[d0 >> 16 & 255]; B['s3b1'] = IS[d0 >> 8 & 255]; B['s4b0'] = IS[d0 & 255];
    function w(b3, b2, b1, b0) { return (b3 << 24) ^ (b2 << 16) ^ (b1 << 8) ^ b0; }
    s1 = w(B['s1b3'], B['s1b2'], B['s1b1'], B['s1b0']);
    s2 = w(B['s2b3'], B['s2b2'], B['s2b1'], B['s2b0']);
    s3 = w(B['s3b3'], B['s3b2'], B['s3b1'], B['s3b0']);
    s4 = w(B['s4b3'], B['s4b2'], B['s4b1'], B['s4b0']);
    // 逆主轮（R 轮）
    const R = list.length / 4 - 2; // 10
    cursor = 4 + 4 * (R - 1);
    for (let r = R - 1; r >= 0; r--) {
      const k = list.slice(cursor, cursor + 4);
      cursor -= 4;
      // 逆 T-table 轮
      const t0 = IT[0][s1 >>> 24] ^ IT[1][s4 >> 16 & 255] ^ IT[2][s3 >> 8 & 255] ^ IT[3][s2 & 255] ^ k[0];
      const t1 = IT[0][s2 >>> 24] ^ IT[1][s1 >> 16 & 255] ^ IT[2][s4 >> 8 & 255] ^ IT[3][s3 & 255] ^ k[1];
      const t2 = IT[0][s3 >>> 24] ^ IT[1][s2 >> 16 & 255] ^ IT[2][s1 >> 8 & 255] ^ IT[3][s4 & 255] ^ k[2];
      const t3 = IT[0][s4 >>> 24] ^ IT[1][s3 >> 16 & 255] ^ IT[2][s2 >> 8 & 255] ^ IT[3][s1 & 255] ^ k[3];
      s1 = t0; s2 = t1; s3 = t2; s4 = t3;
    }
    // 逆 AddRoundKey（list[0..3]）
    s1 = (s1 ^ list[0]) >>> 0; s2 = (s2 ^ list[1]) >>> 0; s3 = (s3 ^ list[2]) >>> 0; s4 = (s4 ^ list[3]) >>> 0;
    return [s1, s2, s3, s4];
  }

  // 往返验证
  console.log('=== 往返验证 decode ===');
  const tKey = numarrAddTime([...new Array(16)].map(() => Math.floor(Math.random() * 256)), Math.floor(Date.now() / 1000), Math.random());
  const plain = [...new Array(24)].map(() => Math.floor(Math.random() * 256));
  const enc = encryptMode1([...plain], [...tKey], 0);
  const cfg = getCfg([...tKey]);
  const cw = [];
  for (let i = 0; i < enc.length; i += 4) cw.push(((enc[i] << 24) | (enc[i + 1] << 16) | (enc[i + 2] << 8) | enc[i + 3]) >>> 0);
  let decBytes = [];
  for (let i = 0; i < cw.length; i += 4) {
    const out = decodeBlock(cfg, cw.slice(i, i + 4));
    for (const w of out) decBytes = decBytes.concat(numToNumarr4(w));
  }
  // PKCS7 去填充
  const pad = decBytes[decBytes.length - 1];
  if (pad >= 1 && pad <= 16) decBytes = decBytes.slice(0, decBytes.length - pad);
  const ok = decBytes.length === plain.length && decBytes.every((v, i) => v === plain[i]);
  console.log('往返一致:', ok);
  if (!ok) { console.log('plain:', plain.join(',')); console.log('dec:', decBytes.join(',')); process.exit(1); }
  console.log('decode 实现正确 ✓');

  // ==== 采集 + 抓自动 request_data → 暴力解密 ====
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const challenges = [];
  const captured = [];
  let pCookie = '';
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/px-') && u.includes('?') && !u.includes('.js')) {
        const qm = u.split('?')[1];
        if (qm && qm.includes('=')) captured.push({ url: u.split('?')[0], q: qm.split('=')[1], t: Date.now() });
      }
    });
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
    if (pc) pCookie = pc.value;
    console.log('标题:', await page.evaluate(() => document.title).catch(() => ''), '412:', challenges.length);
    await page.evaluate(async () => {
      await fetch('/px-gateway/GatewayConfig/getGatewayConfig', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: '{}' });
    });
    await page.waitForTimeout(2000);
    const ch = challenges[challenges.length - 1];
    const cdArr = decryptCd(ch.cd);
    const der = deriveKeys(cdArr);
    const pureK17 = der.keys[17];
    const C = decodeB86(pCookie.slice(1));
    const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = encryptMode2([...C], arr, 1);
    const browserK2 = dec.slice(15, 63);

    if (captured.length === 0) { console.log('无自动 query'); process.exit(1); }
    const autoQ = captured[captured.length - 1].q;
    const autoBytes = decodeB86(autoQ.slice(1));
    const autoReq = autoBytes.slice(56, 88);
    const capTime = captured[captured.length - 1].t;
    console.log('\n自动 request_data:', autoReq.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // 暴力 ele + time 解密
    console.log('\n=== 暴力解密（ele 1-256, time ±30s）===');
    const t0 = Math.floor(capTime / 1000);
    let found = null;
    for (let ele = 1; ele <= 256 && !found; ele++) {
      for (let dt = -30; dt <= 30; dt++) {
        const time = t0 + dt;
        const key21 = numarrAddTime([...pureK17], time, ele / 256);
        const cfg2 = getCfg([...key21]);
        const cw2 = [];
        for (let i = 0; i < autoReq.length; i += 4) cw2.push(((autoReq[i] << 24) | (autoReq[i + 1] << 16) | (autoReq[i + 2] << 8) | autoReq[i + 3]) >>> 0);
        let outBytes = [];
        for (let i = 0; i < cw2.length; i += 4) {
          const o = decodeBlock(cfg2, cw2.slice(i, i + 4));
          for (const w of o) outBytes = outBytes.concat(numToNumarr4(w));
        }
        const pad2 = outBytes[outBytes.length - 1];
        if (pad2 >= 1 && pad2 <= 16) outBytes = outBytes.slice(0, outBytes.length - pad2);
        if (outBytes.length === 24 && outBytes[16] === 0xb7) {
          // 验证 prefix
          const prefOk = outBytes.slice(0, 8).every((v, i) => v === (browserK2[i] ^ MASK[i]));
          if (prefOk) { found = { ele, time, plain: outBytes }; break; }
        }
      }
    }
    if (found) {
      console.log('★★★ 解密成功 ele=' + found.ele, 'time=' + found.time, '(', new Date(found.time * 1000).toISOString(), ')');
      console.log('明文 24B:', found.plain.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('prefix:', found.plain.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('bytes 8-19:', found.plain.slice(8, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('url_crc:', found.plain.slice(20, 24).map(b => b.toString(16).padStart(2, '0')).join(' '));
    } else {
      console.log('暴力未命中（decode 可能还有偏差）');
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
