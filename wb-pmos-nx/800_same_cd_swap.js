/**
 * 800_same_cd_swap.js
 * 终极实验：同 cd 采集多个真实 base（块类型不同）→ 互相替换块区 → 200?
 * 若 200 → 块类型自由（任选模板），纯算法达成！
 * 每变体独立会话（同一 challenge）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { execSync } = require('child_process');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = '/px-common-authcenter/auth/v2/captcha/get';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
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
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '', raw = '';
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
function runCurl(apiUrl, hdrQ, cookieStr, label) {
  try {
    const curlCmd = `curl -s -o /tmp/800_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${apiUrl}' \
-H 'Accept: application/json, text/plain, */*' -H 'ClientTag: OUTNET_BROWSE' -H 'Content-Type: application/json;charset=UTF-8' \
-H 'CurrentRoute: /outNet' -H 'MurR7rxG: ${hdrQ}' -H 'Origin: https://pmos.nx.sgcc.com.cn:10443' -H 'Referer: ${TARGET}' \
-H 'User-Agent: ${UA}' -H 'X-Ticket: undefined' -H 'X-Token: null' -b '${cookieStr}' \
--data-raw '{"captchaType":"blockPuzzle"}'`;
    const code = execSync(curlCmd, { timeout: 30000 }).toString().trim();
    const body = fs.readFileSync('/tmp/800_api.html', 'utf8');
    console.log(label + ': ' + code + ' ' + body.substring(0, 40).replace(/\n/g, ' '));
    return code;
  } catch (e) { console.log(label + ': err ' + ((e.stdout || '').toString().trim() || '').substring(0, 40)); return 'ERR'; }
}
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
  const byLen = {};
  let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLen[c.val]) byLen[c.val] = {};
    byLen[c.val][c.key] = idx;
    if (c.val > maxL) maxL = c.val;
  }
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const mm = byLen[val];
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
const CORES = {
  A: [76, 0, 25, 10, 171, 221, 218, 233, 234],
  B: [49, 144, 170, 189, 221, 174, 158, 169],
  A2: [105, 171, 119, 0, 221, 218, 233, 234],
  C: [249, 117, 222, 42, 169, 237, 173],
  D: [77, 158, 17, 7, 119, 143, 23, 17],
  E: [100, 217, 225, 16, 119, 121, 241, 113],
};
function findBlock(base) {
  for (const [name, core] of Object.entries(CORES)) {
    for (let start = 75; start <= 92; start++) {
      let ok = true;
      for (let k = 0; k < core.length; k++) {
        if (base[start + k] !== core[k]) { ok = false; break; }
      }
      if (ok) return { name, start };
    }
  }
  return null;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');
  const uuidFn = require('@src/handler/parser/common/uuid');
  const xor = require('@src/handler/parser/common/tools').xor;
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });

  huffEncCfg = getEncCfg(getTree());
  const lenMap = {};
  for (let i = 0; i < 256; i++) lenMap[i] = huffEncCfg[i] ? huffEncCfg[i].val : null;
  function encBits(arr) { return arr.reduce((a, v) => a + lenMap[v], 0); }

  // 采集同 cd 多个 base
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  const oCookie = ch.setCookies.find(c => /O=/.test(c)) || '';
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const cdArr = [];
  for (let i = 0; i < ts.cd.length; i += 4) {
    const one = ts.cd[i].charCodeAt(), two = i + 1 < ts.cd.length ? ts.cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < ts.cd.length ? ts.cd[i + 2].charCodeAt() : undefined, four = i + 3 < ts.cd.length ? ts.cd[i + 3].charCodeAt() : undefined;
    two !== undefined && cdArr.push(d1[one] | d2[two]);
    three !== undefined && cdArr.push(d3[two] | d4[three]);
    four !== undefined && cdArr.push(d5[three] | d6[four]);
  }
  const derKeys = deriveKeys(cdArr);
  if (!derKeys) { console.log('keys 失败'); process.exit(1); }
  console.log('固定 challenge: nsd=' + ts.nsd);

  async function captureBase() {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }).catch(() => {}); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(9000);
    const ck = await context.cookies();
    const p = ck.find(c => /P$/.test(c.name));
    await context.close();
    if (!p) return null;
    const dec = encryptMode2([...decodeB86(p.value.slice(1))], keys16arr, 1);
    const na = dec.slice(4);
    const beLen = (na[59] & 0x7f) << 8 | na[60];
    const be = na.slice(61, 61 + beLen);
    const keys2 = na.slice(11, 59);
    const keys17arr = numarrAddTime([...derKeys.keys[17]], 0, 1 / 256)[0];
    const tmp = encryptMode2([...be], keys17arr, 0);
    const huff = tmp.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
    const raw = huffmanDecodeRaw(huff);
    let bestLen = 0;
    const huffHead = huff.slice(0, huff.length - 1);
    for (let L = raw.length; L >= 1; L--) {
      const enc = nxEncrypt68(raw.slice(0, L));
      if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
    }
    return raw.slice(0, bestLen);
  }

  // 采集 6 个同 cd base
  const bases = [];
  for (let i = 0; i < 6; i++) {
    const b = await captureBase();
    if (b) { bases.push(b); const blk = findBlock(b); console.log(`#${i + 1}: len=${b.length} 块=${blk ? blk.name + '@' + blk.start : '?'} bits=${encBits(b)}`); }
    await new Promise(r => setTimeout(r, 1200));
  }
  if (bases.length < 2) { console.log('样本不足'); process.exit(1); }

  // 找两块类型不同的
  const b1 = bases[0], blk1 = findBlock(b1);
  let b2 = null, blk2 = null;
  for (const b of bases.slice(1)) {
    const blk = findBlock(b);
    if (blk && blk1 && blk.name !== blk1.name) { b2 = b; blk2 = blk; break; }
  }
  if (!b2 || !blk2) { console.log('无不同块类型对'); process.exit(1); }
  console.log(`\n配对: base1 块${blk1.name}@${blk1.start} bits=${encBits(b1)} vs base2 块${blk2.name}@${blk2.start} bits=${encBits(b2)}`);
  console.log('base1[68:110]:', b1.slice(68, 110).join(','));
  console.log('base2[68:110]:', b2.slice(68, 110).join(','));

  // 用 base1 的 [68:块末+尾] 替换 base2 的对应区（保留 base2 的前缀 [68:块核心]）
  // 方案：把 base2 的 [68:110] 换成 base1 的 [68:110]（同 cd，前缀应相同，块不同）
  const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath) {
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const plain24 = [
      keys2[0] ^ MASK[0], keys2[1] ^ MASK[1], keys2[2] ^ MASK[2], keys2[3] ^ MASK[3],
      keys2[4] ^ MASK[4], keys2[5] ^ MASK[5], keys2[6] ^ MASK[6], keys2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...derKeys.keys[17]], Math.floor(Date.now() / 1000), Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...keys2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64);
  }
  function crc32b(buf) {
    let c = 0xffffffff;
    for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return (c ^ 0xffffffff) >>> 0;
  }
  function buildCookie(newBase, k2) {
    const huffA = nxEncrypt68(newBase);
    const xorNew = [...huffA];
    for (let i = 0; i < 16; i++) xorNew[i] ^= k2[i];
    const now = Math.floor(Date.now() / 1000);
    const nt = numarrAddTime([...derKeys.keys[17]], now, Math.random())[0];
    const beNew = encryptMode1(xorNew, nt, 0);
    const newNa = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...k2,
      beNew.length >> 8 & 255 | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(newNa));
    return 'a' + numarr2string(encryptMode1([...u4, ...newNa], keys16arr, 1), B86_64);
  }
  function testVariant(name, nb, k2, pName) {
    try {
      const newP = buildCookie(nb, k2);
      const q1 = genQuery(API);
      const url1 = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + q1;
      const code = runCurl(url1, q1, oCookie + '; ' + pName + '=' + newP, name);
      return code;
    } catch (e) { console.log(name + ' 构造失败'); return 'ERR'; }
  }

  // 需要当前会话的 P cookie（同 cd 再采一个）
  const pA = await captureBase();
  if (!pA) { console.log('无 P cookie'); process.exit(1); }
  // 获取 keys2：从 P cookie 解码
  // 简化：用 base1 的 keys2？不，keys2 是 na 的固定部分（同一 cd 应该相同）
  // 直接重新解一个 P cookie 的 keys2
  const pCk = await (async () => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }).catch(() => {}); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(9000);
    const ck = await context.cookies();
    const p = ck.find(c => /P$/.test(c.name));
    await context.close();
    return p;
  })();
  if (!pCk) { console.log('无 P cookie2'); process.exit(1); }
  const dec2 = encryptMode2([...decodeB86(pCk.value.slice(1))], keys16arr, 1);
  const na2 = dec2.slice(4);
  const keys2 = na2.slice(11, 59);

  console.log('\n--- 测试 ---');
  console.log('基线 base2原样 (同cd P cookie):');
  testVariant('base2原样', [...b2], keys2, pCk.name);
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n换块区: base2[68:110] ← base1[68:110] (不同块类型):');
  {
    const nb = [...b2];
    for (let i = 68; i < 110 && i < b1.length && i < b2.length; i++) nb[i] = b1[i];
    const bits = encBits(nb);
    console.log(`  bits ${encBits(b2)}→${bits} ${encBits(b2) !== bits ? '⚠' : ''}`);
    testVariant('换块区(异类型)', nb, keys2, pCk.name);
  }
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n同类型换块区 (若 base2 同类型样本存在):');
  {
    // 找同类型另一个 base
    let sameType = null;
    for (const b of bases) {
      const blk = findBlock(b);
      if (blk && blk.name === blk2.name && b !== b2) { sameType = b; break; }
    }
    if (sameType) {
      const nb = [...b2];
      for (let i = 68; i < 110 && i < sameType.length && i < b2.length; i++) nb[i] = sameType[i];
      const bits = encBits(nb);
      console.log(`  bits ${encBits(b2)}→${bits} ${encBits(b2) !== bits ? '⚠' : ''}`);
      testVariant('换块区(同类型)', nb, keys2, pCk.name);
    } else console.log('  无同类型其他样本');
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
