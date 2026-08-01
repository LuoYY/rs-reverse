/**
 * 318_capture_auto_query.js
 * 同 context 拦截页面自动 fetch 的 API URL（含自动注入的 query），与 Node 生成对比
 * 定位 query 差异：keys2 段 / prefix / CRC
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
const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

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
  let challenge = null, pCookie = '', pCookieName = '', oCookie = null;
  const capturedQueries = [];
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    // 拦截 API 请求抓 URL query
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/px-') && !u.includes('.js') && !u.includes('.css') && !u.includes('.ico') && !u.includes('favicon')) {
        capturedQueries.push({ url: u.split('?')[0], full: u, queryPart: u.includes('?') ? u.split('?')[1] : null, headers: req.headers() });
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
    if (pc) { pCookie = pc.value; pCookieName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    console.log('采集页面标题:', await page.evaluate(() => document.title).catch(() => ''), 'nsd:', challenge ? challenge.nsd : '无', 'P len:', pCookie.length);
    if (!challenge || !pCookie) { console.log('采集失败'); process.exit(1); }

    // 触发业务 API（页面自动注入 query）
    const apiResp = await page.evaluate(async () => {
      const r = await fetch('/px-common-authcenter/auth/v2/captcha/get', { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: JSON.stringify({ captchaType: 'blockPuzzle' }) });
      const t = await r.text();
      return { s: r.status, b: t.substring(0, 100) };
    });
    console.log('触发 API:', apiResp.s, apiResp.b.substring(0, 80));
    await page.waitForTimeout(3000);

    // 打印捕获到的 API query
    console.log('\n=== 页面 API 请求（全部） ===');
    for (const cq of capturedQueries) {
      const api = cq.url.replace('https://pmos.nx.sgcc.com.cn:10443', '');
      console.log('API:', api);
      console.log('  URL query部分:', cq.queryPart ? cq.queryPart.substring(0, 80) : '（无）');
      console.log('  header MurR7rxG:', (cq.headers['murr7rxg'] || '无').substring(0, 50));
      console.log('  header ClientTag:', cq.headers['clienttag'] || '无', 'CurrentRoute:', cq.headers['currentroute'] || '无');
      // 找 query 来源（URL 或 header）
      let qStr = null, qParam = null;
      const qm = cq.queryPart ? cq.queryPart.match(/([A-Za-z0-9_]{10,30})=([^&]+)/) : null;
      if (qm) { qStr = qm[2]; qParam = qm[1]; }
      else if (cq.headers['murr7rxg']) { qStr = cq.headers['murr7rxg']; qParam = 'MurR7rxG(header)'; }
      if (qStr && qStr.length > 80) {
        const bytes = decodeB86(qStr.slice(1));
        console.log('  ★', qParam, 'query长:', qStr.length, '解码:', bytes ? bytes.length + 'B crc:' + bytes.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' ') + ' 标记:' + bytes.slice(4, 7).join(',') + ' keys2:' + bytes.slice(7, 15).map(b => b.toString(16).padStart(2, '0')).join(' ') : '失败');
      }
      console.log('');
    }

    // Node 生成的对比
    const cdArr = decryptCd(challenge.cd);
    const der = deriveKeys(cdArr);
    if (!der) { console.log('offset 推导失败'); process.exit(1); }
    const pureK17 = der.keys[17];
    const C = decodeB86(pCookie.slice(1));
    const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = encryptMode2([...C], arr, 1);
    const browserK2 = dec.slice(4).slice(11, 59);
    console.log('\n=== Node 生成的对比 ===');
    console.log('Node keys2:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

    // 取最后一个自动 query 解码的 keys2 对比
    const autoQs = capturedQueries.filter(c => (c.queryPart && c.queryPart.includes('=')) || c.headers['murr7rxg']);
    const last = autoQs[autoQs.length - 1];
    if (last) {
      let qStr = null;
      const qm = last.queryPart ? last.queryPart.match(/([A-Za-z0-9_]{10,30})=([^&]+)/) : null;
      if (qm) qStr = qm[2];
      else if (last.headers['murr7rxg']) qStr = last.headers['murr7rxg'];
      if (qStr && qStr.length > 80) {
        const bq = decodeB86(qStr.slice(1));
        if (bq) {
          const kAuto = bq.slice(7, 55);
          const same = kAuto.every((v, i) => v === browserK2[i]);
          console.log('自动 query keys2 vs Node keys2 相同:', same);
          if (!same) {
            const diffs = [];
            for (let i = 0; i < 48; i++) if (kAuto[i] !== browserK2[i]) diffs.push(i);
            console.log('差异位置:', diffs.join(','));
            console.log('自动 keys2:', kAuto.map(b => b.toString(16).padStart(2, '0')).join(' '));
            console.log('Node keys2:', browserK2.map(b => b.toString(16).padStart(2, '0')).join(' '));
          }
          const fs = require('fs');
          fs.writeFileSync('/tmp/auto_query.json', JSON.stringify({ url: last.url, param: qm ? qm[1] : 'MurR7rxG(header)', query: qStr, bytes: bq, headers: last.headers }, null, 2));
          console.log('已保存自动 query → /tmp/auto_query.json');
        }
      }
    }
    await context.close();
  } finally { await browser.close(); }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
