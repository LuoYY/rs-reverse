/**
 * 728_A225_fresh_session_per_test.js
 * 每变体独立会话：每个测试用全新的 O cookie + 浏览器采集的 P（或重构）
 * 验证：
 * 1. 独立会话下 530 重构（新时间戳 na）→ 200（基准）
 * 2. 独立会话下 改 base[24-29]=0 → 200/412？（真正的段校验）
 * 3. 独立会话下 改 base[68:93]=0 → 200/412？
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { execSync } = require('child_process');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = 'http://74940609:aFmWc5Fs@36.134.44.6:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64).split('');
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];

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
function numarr2string(numarr, b64) {
  let str = '';
  for (let i = 0; i < numarr.length; i += 3) {
    const a = numarr[i], b = numarr[i + 1], c = numarr[i + 2];
    const t = (a << 16) | (b << 8) | c;
    str += b64[(t >> 18) & 63] + b64[(t >> 12) & 63] + b64[(t >> 6) & 63] + b64[t & 63];
  }
  return str;
}
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
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
function deriveKeysFromCd(cd) {
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
  return deriveKeys(decryptCd(cd));
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
function numarrEncrypt68(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  const len = numarr.length;
  let one = 0, two = 0;
  const pad = 0x68;
  for (let i = 0; i < len; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | pad >> two);
  return ans;
}
function runCurl(apiUrl, hdrQ, cookieStr, label) {
  const curlCmd = `curl -s -o /tmp/225_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${apiUrl}' \
-H 'Accept: application/json, text/plain, */*' \
-H 'ClientTag: OUTNET_BROWSE' \
-H 'Content-Type: application/json;charset=UTF-8' \
-H 'CurrentRoute: /outNet' \
-H 'MurR7rxG: ${hdrQ}' \
-H 'Origin: https://pmos.nx.sgcc.com.cn:10443' \
-H 'Referer: ${TARGET}' \
-H 'User-Agent: ${UA}' \
-H 'X-Ticket: undefined' \
-H 'X-Token: null' \
-b '${cookieStr}' \
--data-raw '{"captchaType":"blockPuzzle"}'`;
  try {
    const code = execSync(curlCmd, { timeout: 30000 }).toString().trim();
    const body = fs.readFileSync('/tmp/225_api.html', 'utf8');
    console.log(label + ':', code, body.substring(0, 60).replace(/\n/g, ' '));
    return code;
  } catch (e) {
    console.log(label + ': err', (e.stdout || '').toString().trim());
    return 'ERR';
  }
}
function extractBase(pA, der, keys16arr, numarrAddTime, encryptMode2) {
  const dec = encryptMode2([...decodeB86(pA.value.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const tmp = encryptMode2([...be], numarrAddTime([...der.keys[17]], 0, 1 / 256)[0], 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ der.keys[2][i]) : v);
  numarrEncrypt68([]);
  function huffmanDecodeRaw(enc) {
    const byLen = {}; let maxL = 0;
    for (let idx = 0; idx < 256; idx++) {
      const c = huffEncCfg[idx];
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
  const raw = huffmanDecodeRaw(huff);
  let bestLen = 0;
  const huffHead = huff.slice(0, huff.length - 1);
  for (let L = raw.length; L >= 1; L--) {
    const enc = numarrEncrypt68(raw.slice(0, L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  return { base: raw.slice(0, bestLen), na };
}

const API = '/px-common-authcenter/auth/v2/captcha/get';
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

  // team-lead 块核心（十进制）
  const BLOCKS = {
    B: [70,49,144,170,189,221,174,158,169],
    A2: [105,171,119,0,221,218,233,234],
    C: [249,117,222,42,169,237,173],
    D: [77,158,17,7,119,143,23,17],
    E: [100,217,225,16,119,121,241,113],
  };
  const hex = (a) => a.map(x => x.toString(16).padStart(2, '0')).join(' ');
  function matchBlock(seg80_92) {
    const matches = [];
    for (const [name, core] of Object.entries(BLOCKS)) {
      const coreHex = hex(core);
      for (let off = 0; off <= seg80_92.length - core.length; off++) {
        const sub = seg80_92.slice(off, off + core.length);
        if (hex(sub) === coreHex) { matches.push(name + '@' + (80 + off)); }
      }
    }
    return matches;
  }
  // 530 重构（743 方式）：重建整个 na = [4,8, now, now, 48, keys2, beLen, be]
  // now 参数可选：默认用浏览器原始 na[6:10] 时间戳（保持 base[80] 匹配），若传 -1 用当前时间
  const mkCookieNewBe = (barr, der, na, nowTs) => {
    const now = nowTs !== undefined && nowTs !== -1 ? nowTs : (nowTs === -1 ? Math.floor(Date.now() / 1000) : ((na[6] << 24 | na[7] << 16 | na[8] << 8 | na[9]) >>> 0));
    const huffNew = numarrEncrypt68(barr);
    const xorNew = [...huffNew];
    xor(xorNew, der.keys[2], 16);
    const beKey = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
    const beNew = encryptMode1(xorNew, beKey, 0);
    const newNa = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...der.keys[2],
      (beNew.length >> 8 & 255) | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(newNa));
    return 'a' + numarr2string(encryptMode1([...u4, ...newNa], keys16arr, 1), B86_64);
  };
  async function collectBase() {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: chF.body }); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(12000);
    const ck = await context.cookies();
    const pA = ck.find(c => c.name.endsWith('P'));
    await context.close();
    if (!pA) return null;
    const { base, na } = extractBase(pA, derF, keys16arr, numarrAddTime, encryptMode2);
    return { base, na, pName: pA.name, pValue: pA.value };
  }

  // === 固定挑战页 + 采集 3 个 base ===
  const chF = await httpsGet(TARGET);
  if (chF.status !== 412) { console.log('挑战失败'); process.exit(1); }
  const mF = chF.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const tsF = { nsd: +mF[1], cd: mF[2] };
  const derF = deriveKeysFromCd(tsF.cd);
  const oCookieF = chF.setCookies.find(c => /O=/.test(c)) || '';
  console.log('固定挑战页 nsd=' + tsF.nsd + ' keys:' + (derF ? 'ok' : 'fail'));
  if (!derF) process.exit(1);

  const recs = [];
  let pName = 'P', pValueOrig = null, naA = null;
  for (let i = 0; i < 5; i++) {
    const rec = await collectBase();
    if (!rec) { console.log('采样' + (i + 1) + ' 无 P'); continue; }
    pName = rec.pName;
    if (i === 0) { pValueOrig = rec.pValue; naA = rec.na; }
    const seg = rec.base.slice(80, 92);
    const ts4 = (rec.na[6] << 24 | rec.na[7] << 16 | rec.na[8] << 8 | rec.na[9]) >>> 0;
    console.log('采样' + (i + 1) + ': len=' + rec.base.length + ' [80]=' + hex([rec.base[80]]) + ' ts末=' + hex(rec.na.slice(8, 10)) + ' 块=' + (matchBlock(seg).join(',') || '无'));
    recs.push(rec);
  }
  if (recs.length < 2) { console.log('样本不足'); process.exit(1); }
  const baseA = recs[0].base;

  // === 换块重放变体（530 重构，O=固定挑战页 O）===
  const swapSeg = (a, b) => { const x = [...a]; for (let i = 80; i < 92; i++) x[i] = b[i]; return x; };
  const blockTypeOf = (b) => { const m = matchBlock(b.slice(80, 92)); return m[0] ? m[0].split('@')[0] : '无'; };
  const variants = [
    { name: 'T0 原始P重放', rawP: pValueOrig },
    { name: 'T1 基准 baseA', barr: baseA },
  ];
  for (let i = 1; i < recs.length; i++) {
    const btA = blockTypeOf(baseA), btB = blockTypeOf(recs[i].base);
    const same = btA === btB && btA !== '无';
    variants.push({ name: 'T2#' + i + ' [' + (same ? '同' : '异') + ']' + btA + '→' + btB, barr: swapSeg(baseA, recs[i].base) });
  }
  // 找第一个异类型样本（用于实验）
  const diffRec = recs.slice(1).find(r => blockTypeOf(r.base) !== blockTypeOf(baseA));
  const DIFF_B = diffRec ? diffRec.base : null;
  const copyR = (a, b, lo, hi) => { const x = [...a]; for (let k = lo; k < hi; k++) x[k] = b[k] ?? x[k]; return x; };
  // 两阶段变体：
  //  phase=probe: 探测当前合法 [80]（漂移窗口）
  //  phase=expe: 合法前导 + 异类型块核心/尾（块强绑定验证）
  for (let v80 = 0; v80 < 16; v80++) {
    variants.push({ name: 'P [80]=' + v80, probe: v80, barr: (() => { const x = [...baseA]; x[80] = v80; return x; })(), now: -1 });
  }
  if (DIFF_B) {
    variants.push({ name: 'X0 异[81:92]+baseA[80]', barr: null, dynamic: (legal80) => { const x = [...baseA]; x[80] = legal80; for (let i = 81; i < 92; i++) x[i] = DIFF_B[i]; return x; }, now: -1 });
    variants.push({ name: 'X1 异[81:92]+[22:29]跟随', barr: null, dynamic: (legal80) => { const x = [...baseA]; x[80] = legal80; for (let i = 81; i < 92; i++) x[i] = DIFF_B[i]; for (let i = 22; i < 29; i++) x[i] = DIFF_B[i]; return x; }, now: -1 });
    variants.push({ name: 'X2 异[81:92]+[20:29]跟随', barr: null, dynamic: (legal80) => { const x = [...baseA]; x[80] = legal80; for (let i = 81; i < 92; i++) x[i] = DIFF_B[i]; for (let i = 20; i < 29; i++) x[i] = DIFF_B[i]; return x; }, now: -1 });
    variants.push({ name: 'X3 异[81:92]+[22:92]跟随', barr: null, dynamic: (legal80) => { const x = [...baseA]; x[80] = legal80; for (let i = 81; i < 92; i++) x[i] = DIFF_B[i]; for (let i = 22; i < 80; i++) x[i] = DIFF_B[i] ?? x[i]; return x; }, now: -1 });
  }
  // 对照：baseA 原值 + 新时间戳
  variants.push({ name: 'T11 baseA原值+新ts', barr: [...baseA], now: -1 });
  // T30 系列：改会话段（base 指纹变，避开防重放）+ 保持 baseA 块类型
  if (DIFF_B) {
    variants.push({ name: 'T30a [22:29]←B+原块', barr: copyR(baseA, DIFF_B, 22, 29), now: -1 });
    variants.push({ name: 'T30e [22:80]←B+原块', barr: copyR(baseA, DIFF_B, 22, 80), now: -1 });
    // 完整替换 DIFF_B base（验证重构链路正确性）
    variants.push({ name: 'T31 完整DIFF_B base', barr: [...DIFF_B], now: -1 });
  }
  // T40 系列：改 [22] 单字节避开防重放 + 浏览器原始时间戳（[80] 与时间戳匹配）
  for (let k = 22; k < 25; k++) {
    variants.push({ name: 'T40a b[' + k + ']^1 原ts', barr: (() => { const x = [...baseA]; x[k] ^= 1; return x; })() });
  }
  variants.push({ name: 'T40b b[25]^1 原ts', barr: (() => { const x = [...baseA]; x[25] ^= 1; return x; })() });
  variants.push({ name: 'T40c b[28]^1 原ts', barr: (() => { const x = [...baseA]; x[28] ^= 1; return x; })() });
  variants.push({ name: 'T40d b[30]^1 原ts', barr: (() => { const x = [...baseA]; x[30] ^= 1; return x; })() });
  variants.push({ name: 'T40e b[60]^1 原ts', barr: (() => { const x = [...baseA]; x[60] ^= 1; return x; })() });

  const derCur = derF;
  const legal80s = [];
  for (const v of variants) {
    let barr = v.barr;
    if (v.dynamic) {
      const legal80 = legal80s.length ? legal80s[0] : baseA[80];
      if (!legal80s.length) console.log('  [探测] 未找到合法 [80] 值，用 baseA 原始 [80]=' + baseA[80] + '（浏览器验证合法）');
      barr = v.dynamic(legal80);
    }
    const cookie = v.rawP ? v.rawP : mkCookieNewBe(barr, derCur, naA, v.now);
    if (v.rawP && v.rawP !== pValueOrig) {
      try {
        const rawB = decodeB86(pValueOrig.slice(1));
        const rawT = decodeB86(cookie.slice(1));
        console.log('  密文对比[' + v.name + ']: 浏览器len=' + rawB.length + ' T0b-len=' + rawT.length + ' 浏览器头=' + hex(rawB.slice(0, 24)) + ' T0b头=' + hex(rawT.slice(0, 24)));
        const decB = encryptMode2([...decodeB86(cookie.slice(1))], keys16arr, 1);
        const naB = decB.slice(4);
        const naSame = naB.length === naOrigArr.length && naB.every((x, k) => x === naOrigArr[k]);
        console.log('  自检[' + v.name + ']: P长度 ' + pValueOrig.length + '->' + cookie.length + ' na对比 ' + (naSame ? '一致' : '不一致! 原len=' + naOrigArr.length + ' 新len=' + naB.length + ' 首差@' + naB.findIndex((x, k) => x !== naOrigArr[k])));
        const rb = extractBase({ name: pName, value: cookie }, derF, keys16arr, numarrAddTime, encryptMode2);
        const same = rb.base.length === baseA.length && rb.base.every((x, k) => x === baseA[k]);
        console.log('  自检[' + v.name + ']: 重编码解base ' + (same ? '一致 len=' + rb.base.length : '不一致! 期望len=' + baseA.length + ' 解len=' + rb.base.length + ' 头=' + hex(rb.base.slice(0, 6))));
      } catch (e) { console.log('  自检[' + v.name + ']: 解失败 ' + e.message); }
    }
    if (barr) {
      try {
        const rb = extractBase({ name: pName, value: cookie }, derF, keys16arr, numarrAddTime, encryptMode2);
        const same = rb.base.length === barr.length && rb.base.every((x, k) => x === barr[k]);
        console.log('  自检[' + v.name + ']: 重构解base ' + (same ? '一致 len=' + rb.base.length : '不一致! 原len=' + barr.length + ' 解len=' + rb.base.length));
      } catch (e) { console.log('  自检[' + v.name + ']: 解失败 ' + e.message); }
    }
    const q = genQuery(API, derCur);
    const code = runCurl(url(q), q, oCookieF + '; ' + pName + '=' + cookie, v.name);
    if (v.probe !== undefined && code == 200) legal80s.push(v.probe);
    await new Promise(r => setTimeout(r, 1200));
  }
  try { fs.writeFileSync('/tmp/nx_A237_b80_ts.json', JSON.stringify(recs.map(r => ({ b80: r.base[80], b80_92: r.base.slice(80, 92), ts4: (r.na[6] << 24 | r.na[7] << 16 | r.na[8] << 8 | r.na[9]) >>> 0, na: r.na.slice(0, 61), base22: r.base.slice(22, 80) })))); } catch (e) {}
  await browser.close();
  process.exit(0);

  function genQuery(urlPath, der) {
    const k2 = der.keys[2];
    const randByte = () => Math.floor(Math.random() * 256);
    const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
    const plain24 = [
      k2[0] ^ MASK[0], k2[1] ^ MASK[1], k2[2] ^ MASK[2], k2[3] ^ MASK[3],
      k2[4] ^ MASK[4], k2[5] ^ MASK[5], k2[6] ^ MASK[6], k2[7] ^ MASK[7],
      randByte(), randByte(), randByte(), randByte(), randByte(),
      randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
      (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
    ];
    const [key21] = numarrAddTime([...der.keys[17]], Math.floor(Date.now() / 1000), Math.random());
    const requestData = encryptMode1(plain24, key21, 0);
    const body = [4, 0, 48, ...k2, 32, ...requestData];
    const crc = crc32b(Buffer.from(body));
    return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64);
  }
  function url(q) { return 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + q; }
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
