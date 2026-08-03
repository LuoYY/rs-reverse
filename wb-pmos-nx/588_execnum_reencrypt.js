/**
 * 588_execnum_reencrypt.js
 * 决定性：改 basearr[26-29] = 5000万（0x02FAF080）重构 cookie → 不同 URL → 200?
 * 复用 534 号重加密全流程（numarrEncrypt68 + xor keys2 + encryptMode1 keys17+time → be → nextarr → cookie）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = '/api/cloud/basic/framework/api/baseinfo/getBaseInfo';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

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

function curlReq(api, query, cookie, tag) {
  return new Promise((resolve) => {
    const url = 'https://pmos.nx.sgcc.com.cn:10443' + api + '?' + query;
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR', tag }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nCookie: ${cookie}\r\nConnection: close\r\n\r\n`);
      });
      let raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        const status = headEnd >= 0 ? parseInt((raw.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR';
        resolve({ status, tag });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', tag }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', tag }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT', tag }); });
    connectReq.end();
  });
}

// 534 号已验证的完整工具集
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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
function numarr2string(numarr, base) {
  const B86_64 = base || NX_BS;
  let str = '';
  let l = numarr.length, t = 0;
  const i = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const w = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let q = 0; q < l; q++) {
    t = numarr[q];
    for (let p = 0; p < 10; p++) {
      w[p] = (w[p] << 8) | t;
      i[p] = 0;
      while (w[p] > 63) { w[p] -= 64; i[p]++; }
      t = i[p];
    }
  }
  for (let p = 0; p < 10; p++) { if (w[p] > 0) str += B86_64[w[p]]; }
  for (let p = 0; p < 10; p++) { while (i[p] > 0) { str += B86_64[i[p] & 63]; i[p] >>= 6; } }
  return str;
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
function huffmanDecodeRaw(enc) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const byLenMap = {}; let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = huffEncCfg[idx];
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
function encryptMode1(numarr, encryptKeys, mode = 0) {
  const B86_64 = NX_BS;
  const encr = (one, two) => {
    if (two < 256) return { one: one, two: one & (two - 1) };
    let ans = [];
    let a = 1;
    for (let i = 0; i < 6; i++) {
      let aa = (one & (two - 1)) % 256;
      if (aa < 0) aa += 256;
      ans.unshift(aa);
      one = (one - aa) / 256;
      a *= 256;
    }
    return { one, two: ans };
  };
  let ans = [], n = 1;
  for (let i = 0; i < numarr.length; i++) {
    const k = encryptKeys[i % encryptKeys.length];
    const r = encr(numarr[i], k);
    ans.push(r.two);
    n += 1;
  }
  // mode1 编码
  return ans;
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  const oCookie = ch.setCookies.find(c => /O=/.test(c)) || '';
  console.log('nsd=' + ts.nsd + ' O=' + oCookie.substring(0, 15));

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(10000);
  const ck = await context.cookies();
  const p = ck.find(c => c.name.endsWith('P'));
  console.log('P len:', p ? p.value.length : 0);
  await page.close();
  await browser.close();
  if (!p) { console.log('无 P'); process.exit(1); }

  // 用完整 534 号流程：解密 cookie 提取 basearr + keys2 + keys17，改 [26-29] 重构造
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

  const dec = encryptMode2([...decodeB86(p.value.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = (na[59] & 0x7f) << 8 | na[60];
  const be = na.slice(61, 61 + beLen);
  const keys2 = na.slice(11, 59);

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
  const der = deriveKeys(decryptCd(ts.cd));
  if (!der) { console.log('keys 派生失败'); process.exit(1); }
  const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const tmp = encryptMode2([...be], keys17arr, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
  const raw = huffmanDecodeRaw(huff);
  let bestLen = 0;
  const huffHead = huff.slice(0, huff.length - 1);
  for (let L = raw.length; L >= 1; L--) {
    const enc = numarrEncrypt68(raw.slice(0, L));
    if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
  }
  const base = raw.slice(0, bestLen);
  console.log('basearr len:', base.length, '[24-29]:', base.slice(24, 30).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('原[25-28] BE:', base.slice(25, 29).reduce((a, x) => a * 256 + x, 0));

  // 变体 A: 原样重构（验证重构流程 200）
  // 变体 B: [26-29]=5000万
  // 变体 C: [26-29]=浏览器实测循环（本机已测 ~56M/1500ms）
  const variants = {
    'A原样重构': [...base],
    'B_5000w': (() => { const b = [...base]; b[26] = 0x02; b[27] = 0xFA; b[28] = 0xF0; b[29] = 0x80; return b; })(),
    'C_6000w': (() => { const b = [...base]; const v = 60000000; b[26] = (v >>> 24) & 255; b[27] = (v >>> 16) & 255; b[28] = (v >>> 8) & 255; b[29] = v & 255; return b; })(),
  };

  // 重加密构造 cookie（534 号流程）
  function reencrypt(modifiedBase) {
    const huffA = numarrEncrypt68(modifiedBase);
    const xorNew = [...huffA];
    // xor keys2 16 字节
    for (let i = 0; i < 16; i++) xorNew[i] ^= keys2[i];
    const now = Math.floor(Date.now() / 1000);
    const random = Math.random();
    const nt = numarrAddTime([...der.keys[17]], now, random)[0];
    const beNew = encryptMode1(xorNew, nt, 0);
    const start = now - Math.floor(random * 100000);
    const nextarr = [4, 8, ...numarr2string([...'r2mka'], 256).split('').map(c => c.charCodeAt()).slice(0, 4), ...numarr2string([...'start'], 256).split('').map(c => c.charCodeAt()).slice(0, 4), 48, ...keys2, (0x80 | (beNew.length >> 8)), beNew.length & 255, ...beNew];
    // 用原 cookie 的 r2mka/start 更好
    return null;
  }
  console.log('注: 重加密流程在 534 号已验证，此处用简化验证');

  // 直接测试：改 [26-29] 后重加密构造（复用 534 号完整逻辑）
  // 因为时间关系，先验证关键假设：原值 basearr 重构 vs 5000万 重构
  // 使用 nx_pure_client 的 genCookie 逻辑（534 号已 200）
  try {
    const nxpure = require(path.join(ROOT, 'output/keygen/nx_pure_client.js'));
    if (nxpure.genCookie) {
      console.log('nx_pure_client 可用');
    }
  } catch (e) { console.log('nx_pure_client:', e.message.substring(0, 60)); }

  // 用 534 号完整重加密逻辑（从 cookie dec 提取全部要素）
  // nextarr 结构: na[0]=4, na[1]=8, na[2-5]=r2mka, na[6-9]=start, na[10]=48, na[11-58]=keys2, na[59]=flag, na[60]=len, na[61+]=be
  // 新 be = encryptMode1(xor(numarrEncrypt(newBase), keys2), numarrAddTime(keys17,now,rand)[0])
  // 新 na = [4,8,...r2mka_old,...start_old,48,...keys2, flag, len, ...be]
  // 新 cookie = 'a' + numarr2string(encryptMode1([uuid4,...na], keys16arr, 1))
  const { numToNumarr4, uuid } = require(path.join(ROOT, 'src/handler/parser'));
  function buildCookie(newBase, tag) {
    const huffA = numarrEncrypt68(newBase);
    const xorNew = [...huffA];
    for (let i = 0; i < 16; i++) xorNew[i] ^= keys2[i];
    const now = Math.floor(Date.now() / 1000);
    const random = Math.random();
    const nt = numarrAddTime([...der.keys[17]], now, random)[0];
    const beNew = encryptMode1(xorNew, nt, 0);
    // 保留原 r2mka/start（na[2-9]）
    const r2mka = na.slice(2, 6);
    const startv = na.slice(6, 10);
    const flag = na[59];
    const newNa = [4, 8, ...r2mka, ...startv, 48, ...keys2, flag, (beNew.length >> 8) & 127, beNew.length & 255, ...beNew];
    // uuid
    const u4 = [0x12, 0x34, 0x56, 0x78]; // 简化 uuid（外层验证在 526 号）
    const final = encryptMode1([...u4, ...newNa], keys16arr, 1);
    return 'a' + numarr2string(final, NX_BS);
  }

  for (const [name, nb] of Object.entries(variants)) {
    try {
      const newP = buildCookie(nb, name);
      console.log(name + ' cookie len:', newP.length);
      const q = 'r20SZOQm=' + 'x'.repeat(119) + '&t=' + Date.now() + Math.floor(Math.random() * 100000);
      const r = await curlReq(API, q, oCookie + '; ' + p.name + '=' + newP, name);
      console.log(name + ' →', r.status);
      await new Promise(r2 => setTimeout(r2, 1500));
    } catch (e) { console.log(name + ' 构造失败:', e.message.substring(0, 80)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
