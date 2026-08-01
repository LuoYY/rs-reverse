/**
 * 320_calibrate_session.js
 * 同会话：采集 P cookie + 页面自动 API query，校准 keys2 提取偏移
 * 核心：dec（外层解密 nextarr）中哪个偏移 = 自动 query 的 keys2
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
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let challenge = null, pCookie = '';
  const captured = [];
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/px-') && u.includes('?') && !u.includes('.js')) {
        const qm = u.split('?')[1];
        if (qm && qm.includes('=')) captured.push({ url: u.split('?')[0], q: qm.split('=')[1] });
      }
    });
    page.on('response', async (resp) => {
      if (resp.status() === 412 && !challenge) {
        try {
          const body = await resp.text();
          const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
          const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
          challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
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
    console.log('页面标题:', await page.evaluate(() => document.title).catch(() => ''), 'nsd:', challenge ? challenge.nsd : '无', 'P len:', pCookie.length);

    // 触发 API
    await page.evaluate(async () => {
      await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
    });
    await page.waitForTimeout(2000);

    if (!challenge || !pCookie || captured.length === 0) { console.log('采集/捕获失败'); process.exit(1); }

    // 自动 query keys2（真值）
    const autoQ = captured[captured.length - 1].q;
    const autoBytes = decodeB86(autoQ.slice(1));
    const autoK2 = autoBytes.slice(7, 55);
    console.log('自动 query:', autoQ.substring(0, 30) + '... len:', autoQ.length);
    console.log('自动 keys2:', autoK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // Node 解密 P cookie → dec
    const cdArr = decryptCd(challenge.cd);
    const der = deriveKeys(cdArr);
    const C = decodeB86(pCookie.slice(1));
    const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = encryptMode2([...C], arr, 1);
    console.log('\ndec 前 70 字节:');
    console.log(dec.slice(0, 70).map((b, i) => i + ':' + b.toString(16).padStart(2, '0')).join(' '));

    // 暴力搜索 keys2 偏移（找与 autoK2 前 8 字节匹配的 48 连续段）
    console.log('\n=== 搜索 dec 中匹配 autoK2 前 8 字节的偏移 ===');
    for (let off = 0; off < dec.length - 48; off++) {
      let match = 0;
      for (let i = 0; i < 8; i++) if (dec[off + i] === autoK2[i]) match++;
      if (match >= 6) console.log(`off=${off} 前8匹配${match}/8`);
    }

    // 也对比纯算法 keys[2]（der.keys[2]）
    if (der) {
      console.log('\nder.keys[2] (纯算法):', der.keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '), 'len:', der.keys[2].length);
      const same = der.keys[2].every((v, i) => v === autoK2[i]);
      console.log('纯算法 keys[2] == 自动 keys2:', same);
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
