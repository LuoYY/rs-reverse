/**
 * 358_keys2_diff_analysis.js
 * 多会话分析：浏览器 keys2 vs 派生 keys2（cd 静态）的差值关系
 * 若 XOR 差值恒定 → keys2 = 派生 ^ 常量（可建模）；若变 → 依赖内层 VM/随机
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
function deriveKeysFromCd(cd) {
  const cdArr = decryptCdStr(cd);
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const tail = cdArr.slice(end);
  for (let k0 = 0; k0 <= 255; k0++) {
    for (let k1 = 0; k1 <= 255; k1++) {
      const off = [tail[0] ^ 51, tail[1] ^ 2, tail[2] ^ k0, tail[3] ^ k1, tail[4] ^ 2, tail[5] ^ k0, tail[6] ^ k1, tail[7] ^ 48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
      for (const step of [1, 2]) {
        const keys = [];
        let op = 1, gap, ok = true;
        try {
          for (let i = 0; i < ans[0]; i++) {
            if (step === 2) { if (op + 1 >= ans.length) { ok = false; break; } gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
            else { [gap, op] = getLensGo(ans, op); }
            if (gap < 0 || op + gap > ans.length) { ok = false; break; }
            keys.push(ans.slice(op, op + gap));
            op += gap;
          }
        } catch (e) { ok = false; }
        if (!ok) continue;
        if (keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i]) && keys[7] && ascii2string(keys[7]).includes(';')) {
          return { keys, k0, k1, step };
        }
      }
    }
  }
  return null;
}
function ascii2string(arr) {
  return arr.map(b => String.fromCharCode(b)).join('');
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
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');

  const sessions = [];
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  try {
    for (let round = 1; round <= 3; round++) {
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
      try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
      let pCookie = '';
      for (let i = 0; i < 20 && !pCookie; i++) {
        await page.waitForTimeout(2000);
        const cks = await context.cookies();
        const pc = cks.find(c => c.name.endsWith('P'));
        if (pc) pCookie = pc.value;
      }
      await context.close();
      if (!ch1 || !pCookie) continue;
      // 浏览器 keys2
      const C = decodeB86(pCookie.slice(1));
      const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
      const dec = encryptMode2([...C], arr, 1);
      const browserK2 = dec.slice(15, 63);
      // 派生 keys2
      const d = deriveKeysFromCd(ch1.cd);
      if (!d) { console.log(`#${round} 派生失败`); continue; }
      const derK2 = d.keys[2];
      const xor = browserK2.map((v, i) => v ^ derK2[i]);
      sessions.push({ nsd: ch1.nsd, browserK2, derK2, xor, d });
      console.log(`会话#${round} nsd=${ch1.nsd}`);
      console.log(`  browser: ${browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      console.log(`  derived: ${derK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      console.log(`  XOR    : ${xor.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    }
  } finally { await browser.close(); }

  // 对比各会话 XOR 差值
  if (sessions.length >= 2) {
    console.log('\n=== XOR 差值跨会话对比 ===');
    const x0 = sessions[0].xor;
    for (let i = 1; i < sessions.length; i++) {
      const same = x0.every((v, j) => v === sessions[i].xor[j]);
      console.log(`会话0 vs ${i} XOR 相同: ${same}`);
      if (!same) {
        const diffs = [];
        for (let j = 0; j < 48; j++) if (x0[j] !== sessions[i].xor[j]) diffs.push(j);
        console.log(`  差异位置: ${diffs.join(',')} (${diffs.length}/48)`);
      }
    }
    // 也对比派生 keys2 是否跨会话恒定（cd 静态部分）
    const d0 = sessions[0].derK2;
    for (let i = 1; i < sessions.length; i++) {
      const same = d0.every((v, j) => v === sessions[i].derK2[j]);
      console.log(`派生 keys2 会话0 vs ${i} 相同: ${same}`);
    }
    // keys17 是否恒定
    const k17_0 = sessions[0].d.keys[17];
    for (let i = 1; i < sessions.length; i++) {
      const same = k17_0.every((v, j) => v === sessions[i].d.keys[17][j]);
      console.log(`keys17 会话0 vs ${i} 相同: ${same}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
