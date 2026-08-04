/**
 * 795_full_block_swap.js
 * 决定性测试：[80:92] 完整替换（前导+块核心+尾）用其他样本配套值 + 保持bits → 200?
 * 若 200 → 块类型可换（配套即可）→ 纯算法用固定配套模板！
 * 若 412 → 块类型绑定当前 cd → 需 VM
 * 每变体独立会话
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
    const curlCmd = `curl -s -o /tmp/795_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${apiUrl}' \
-H 'Accept: application/json, text/plain, */*' -H 'ClientTag: OUTNET_BROWSE' -H 'Content-Type: application/json;charset=UTF-8' \
-H 'CurrentRoute: /outNet' -H 'MurR7rxG: ${hdrQ}' -H 'Origin: https://pmos.nx.sgcc.com.cn:10443' -H 'Referer: ${TARGET}' \
-H 'User-Agent: ${UA}' -H 'X-Ticket: undefined' -H 'X-Token: null' -b '${cookieStr}' \
--data-raw '{"captchaType":"blockPuzzle"}'`;
    const code = execSync(curlCmd, { timeout: 30000 }).toString().trim();
    const body = fs.readFileSync('/tmp/795_api.html', 'utf8');
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

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
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
  const groups = {};
  for (let i = 0; i < 256; i++) {
    lenMap[i] = huffEncCfg[i] ? huffEncCfg[i].val : null;
    if (lenMap[i] !== null) (groups[lenMap[i]] ||= []).push(i);
  }
  function encBits(arr) { return arr.reduce((a, v) => a + lenMap[v], 0); }

  // 加载其他样本 base
  const io = JSON.parse(fs.readFileSync('/tmp/nx_io_pairs.json', 'utf8'));
  const otherBases = io.map(x => x.base).filter(b => b.length >= 92);

  function findBlock(base) {
    const CORES = {
      B: [49, 144, 170, 189, 221, 174, 158, 169],
      A2: [105, 171, 119, 0, 221, 218, 233, 234],
      C: [249, 117, 222, 42, 169, 237, 173],
      D: [77, 158, 17, 7, 119, 143, 23, 17],
      E: [100, 217, 225, 16, 119, 121, 241, 113],
    };
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

  // 补偿函数：在可调位置调整使 bits 差归零
  function compensate(x, targetBits, base) {
    let d = targetBits - encBits(x);
    const adjustable = [69, 70, 71, 74, 75, 76, 77, 78, 79, 80, 81].filter(i => base[i] === x[i]); // 只动未改位置
    for (let pass = 0; pass < 3 && d !== 0; pass++) {
      for (const i of adjustable) {
        if (d === 0) break;
        const origLen = lenMap[x[i]];
        const cand = groups[origLen].filter(v => v !== x[i]);
        // 优先选择能朝 d 方向调整的
        let best = null;
        for (const v of cand) {
          const nd = d - (lenMap[v] - origLen);
          if (best === null || Math.abs(nd) < Math.abs(d - (lenMap[best] - origLen))) best = v;
        }
        if (best !== null && lenMap[best] !== origLen) { x[i] = best; d = targetBits - encBits(x); }
      }
    }
    return { arr: x, d };
  }

  const tests = [
    { name: 'T0_原样', run: (base) => ({ barr: [...base], d: 0 }) },
    { name: 'T1_[80:92]换其他样本配套', run: (base) => {
        const blk = findBlock(base);
        if (!blk) return null;
        // 选一个不同块类型的 other
        for (const ob of otherBases) {
          const oblk = findBlock(ob);
          if (oblk && oblk.name !== blk.name && ob.length >= 92) {
            const x = [...base];
            for (let i = 80; i < 92; i++) x[i] = ob[i];
            const c = compensate(x, encBits(base), base);
            return { barr: c.arr, d: c.d, otherName: oblk.name, blkName: blk.name };
          }
        }
        return null;
      } },
    { name: 'T2_仅块核心换其他样本', run: (base) => {
        const blk = findBlock(base);
        if (!blk) return null;
        for (const ob of otherBases) {
          const oblk = findBlock(ob);
          if (oblk && oblk.name !== blk.name) {
            const x = [...base];
            // 只换核心（oblk.start 起）
            for (let k = 0; k < 7; k++) x[blk.start + k] = ob[oblk.start + k];
            const c = compensate(x, encBits(base), base);
            return { barr: c.arr, d: c.d, otherName: oblk.name, blkName: blk.name };
          }
        }
        return null;
      } },
  ];

  for (const t of tests) {
    const ch = await httpsGet(TARGET);
    if (ch.status !== 412) { console.log(t.name, '挑战失败', ch.status); continue; }
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
    if (!derKeys) { console.log(t.name, 'keys 失败'); continue; }
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }).catch(() => {}); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(9000);
    const ck = await context.cookies();
    const pA = ck.find(c => /P$/.test(c.name));
    await context.close();
    if (!pA) { console.log(t.name, '无 P'); continue; }
    const pName = pA.name;

    const dec = encryptMode2([...decodeB86(pA.value.slice(1))], keys16arr, 1);
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
    const base = raw.slice(0, bestLen);
    const blk = findBlock(base);
    console.log(`${t.name} nsd=${ts.nsd} base.len=${base.length} 当前块=${blk ? blk.name + '@' + blk.start : '?'}`);
    console.log(`  [78:94]原=${base.slice(78, 94).join(',')}`);
    const r = t.run(base);
    if (!r) { console.log('  构造失败'); continue; }
    const barr = r.barr;
    const bBits = encBits(base), nBits = encBits(barr);
    console.log(`  目标块=${r.otherName || ''} 原块=${r.blkName || ''} bits ${bBits}→${nBits} 补偿残差=${r.d} ${bBits !== nBits ? '⚠' : ''}`);
    console.log(`  [78:94]新=${barr.slice(78, 94).join(',')}`);

    const now = Math.floor(Date.now() / 1000);
    const huffNew = nxEncrypt68(barr);
    const xorNew = [...huffNew];
    xor(xorNew, keys2, 16);
    const beNew = encryptMode1(xorNew, numarrAddTime([...derKeys.keys[17]], now, Math.random())[0], 0);
    const naNew = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...keys2,
      beNew.length >> 8 & 255 | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(naNew));
    const cookie = 'a' + numarr2string(encryptMode1([...u4, ...naNew], keys16arr, 1), B86_64);
    const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
    const randByte = () => Math.floor(Math.random() * 256);
    const cu = (() => { let c = 0xffffffff; for (const b of Buffer.from(API.toUpperCase())) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; })();
    const plain24 = [
      keys2[0] ^ MASK[0], keys2[1] ^ MASK[1], keys2[2] ^ MASK[2], keys2[3] ^ MASK[3],
      keys2[4] ^ MASK[4], keys2[5] ^ MASK[5], keys2[6] ^ MASK[6], keys2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...derKeys.keys[17]], now, Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...keys2, 32, ...requestData];
    const crc = (() => { let c = 0xffffffff; for (const b of body) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; })();
    const q = 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64);
    const apiUrl = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + q;
    runCurl(apiUrl, q, oCookie + '; ' + pName + '=' + cookie, t.name);
    await new Promise(r => setTimeout(r, 1500));
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
