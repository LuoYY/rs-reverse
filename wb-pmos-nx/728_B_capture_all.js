/**
 * 728_B_capture_all.js
 * 同会话一次性采集：cd + cap(CDP 113) + basearrB(be解码 100) + base179(be解码 179)
 * 输出 /tmp/728_B_all_forms.json 用于离线对比四种形态与 b86 的关系
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_EXT = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_EXT_AUTH = 'Basic ' + Buffer.from(PROXY_EXT.username + ':' + PROXY_EXT.password).toString('base64');

function decodeB86(str) {
  const idxmap = {};
  for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = [];
  let qi = 0;
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
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_EXT.hostname, port: +PROXY_EXT.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_EXT_AUTH, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          const setCookies = [];
          resHead.split('\r\n').forEach(l => { if (/^set-cookie:/i.test(l)) setCookies.push(l.substring(11).split(';')[0]); });
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4), setCookies });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let huffEncCfg = null;
function nxEncrypt68(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  let one = 0, two = 0;
  const pad = 0x68;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | pad >> two);
  return ans;
}
function huffmanDecodeRaw(enc) {
  const encCfg = getEncCfg(getTree());
  const byLenMap = {};
  let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxL) maxL = c.val;
  }
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const mm = byLenMap[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}
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
  const arr2 = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && arr2.push(d1[one] | d2[two]);
    three !== undefined && arr2.push(d3[two] | d4[three]);
    four !== undefined && arr2.push(d5[three] | d6[four]);
  }
  return arr2;
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

async function captureOne(browser, ch) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => {
    route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }).catch(() => {});
  });
  const pushR = await cdp.send('Runtime.evaluate', { expression: 'Array.prototype.push' });
  await cdp.send('Debugger.setBreakpointOnFunctionCall', {
    objectId: pushR.result.objectId,
    condition: '(this.length >= 130 && this.length <= 250 && this[0] === 113 && this.every(function(x){return typeof x === "number" && x >= 0 && x < 256;}) && (!window.__capLen || this.length > window.__capLen)) ? (window.__capArr = Array.from(this), window.__capLen = this.length, false) : false',
  });
  cdp.on('Debugger.paused', async () => { await cdp.send('Debugger.resume').catch(() => {}); });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await new Promise(r => setTimeout(r, 15000));
  let cap = null;
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: 'window.__capArr ? JSON.stringify(window.__capArr) : "null"', returnByValue: true });
    cap = JSON.parse(r.result?.value || 'null');
  } catch (e) {}
  let p = null;
  for (let i = 0; i < 10 && !p; i++) {
    await page.waitForTimeout(4000);
    const ck = await context.cookies();
    p = ck.find(c => /P$/.test(c.name));
  }
  const o = (await context.cookies()).find(c => /O=/.test(c.name)) || null;
  await context.close();
  return { cap, p, o };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Chromium.app/Contents/MacOS/Chromium', headless: true,
    proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' },
    args: ['--ignore-certificate-errors', '--no-sandbox'],
  });
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const ch = await httpsGet(TARGET);
    if (ch.status !== 412) { console.log(`S${i + 1} 拉取失败 ${ch.status}`); continue; }
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    if (!m) continue;
    const nsd = +m[1], cd = m[2];
    const b86 = decodeB86(cd);
    const der = deriveKeys(decryptCd(cd));
    if (!der) { console.log(`S${i + 1} keys 派生失败`); continue; }
    let { cap, p, o } = await captureOne(browser, ch);
    if (!cap || !p) {
      console.log(`S${i + 1} 首轮无 cap/p (cap=${!!cap} p=${!!p})，重试...`);
      for (let retry = 0; retry < 4 && (!cap || !p); retry++) {
        const r = await captureOne(browser, ch);
        cap = r.cap || cap; p = r.p || p; o = r.o || o;
        console.log(`  retry${retry + 1}: cap=${!!cap} p=${!!p}`);
      }
    }
    if (!cap || !p) { console.log(`S${i + 1} 最终无 cap/p`); continue; }
    const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
    const dec = encryptMode2([...decodeB86(p.value.slice(1))], keys16arr, 1);
    const na = dec.slice(4);
    const beLen = (na[59] & 0x7f) << 8 | na[60];
    const be = na.slice(61, 61 + beLen);
    const keys2 = na.slice(11, 59);
    const tmp = encryptMode2([...be], keys17arr, 0);
    const huff = tmp.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
    const raw = huffmanDecodeRaw(huff);
    let bestLen = 0;
    const huffHead = huff.slice(0, huff.length - 1);
    for (let L = raw.length; L >= 1; L--) {
      const enc = nxEncrypt68(raw.slice(0, L));
      if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
    }
    const base179 = raw.slice(0, bestLen);
    samples.push({ nsd, cd, cap, base179, keys2, be, beLen, r2mka: na.slice(2, 6), start: na.slice(6, 10) });
    console.log(`S${i + 1} nsd=${nsd}: cap=${cap.length} base179=${base179.length} be=${be.length}`);
    console.log(`  cap[0:8]=${cap.slice(0, 8).join(',')} base179[0:8]=${base179.slice(0, 8).join(',')}`);
    console.log(`  cap[24:30]=${cap.slice(24, 30).join(',')} b86[26:32]=${b86.slice(26, 32).join(',')}`);
    console.log(`  base179[24:30]=${base179.slice(24, 30).join(',')} b86[25:31]=${b86.slice(25, 31).join(',')}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  fs.writeFileSync('/tmp/728_B_all_forms.json', JSON.stringify(samples, null, 1));
  console.log(`\n完成: ${samples.length} 样本 → /tmp/728_B_all_forms.json`);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
