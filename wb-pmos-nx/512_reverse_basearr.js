/**
 * 512_reverse_basearr.js
 * 从浏览器 cookie 逆向 basearr 明文（Cookie.js run() 反向流程）
 * 1. dec = encryptMode2(P_bytes, keys16arr, 1) → [uuid(4), ...nextarr]
 * 2. nextarr = dec.slice(4)：[2, r2mkaTime(4), startTime(4), keys2(48), flag(1), basearrEncrypt]
 * 3. basearrEncrypt → encryptMode2(keys17arr, 0) → xor(huffman(basearr), keys2, 16)
 * 4. xor 逆 → huffman 解码 → basearr 明文
 * 对比 len243-nx.js 的 317B 浏览器权威样本
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
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
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
// huffman 解码（numarrEncrypt 逆）
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
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let encCfg = null;
function huffmanDecode(enc) {
  if (!encCfg) encCfg = getEncryptConfig(getTree());
  // 建立 (val, key) → idx 映射
  const byLen = {};
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLen[c.val]) byLen[c.val] = {};
    byLen[c.val][c.key] = idx;
  }
  const maxLen = Object.keys(byLen).reduce((a, b) => Math.max(a, +b), 0);
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      if (byLen[val] && byLen[val][key] !== undefined) {
        ans.push(byLen[val][key]);
        key = 0; val = 0;
        if (val === maxLen) break;
      }
    }
  }
  return ans;
}

(async () => {
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('nsd 解析失败'); process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  // cd 派生 keys17
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
  const cdArr = decryptCd(ts.cd);
  const der = deriveKeys(cdArr);
  const pureK17 = der ? der.keys[17] : null;
  if (!pureK17) { console.log('keys17 派生失败'); process.exit(1); }
  const keys2 = der.keys[2];
  console.log('keys17:', pureK17.map(b => b.toString(16).padStart(2, '0')).join(' ').substring(0, 47));
  console.log('keys2 len:', keys2.length);

  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode1, encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const keys17arr = numarrAddTime([...pureK17], 0, 1 / 256)[0];

  // 浏览器 2 次逆向 basearr
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const basearrs = [];
  for (let round = 1; round <= 2; round++) {
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(9000);
    const ck = await context.cookies();
    const p = ck.find(c => c.name.endsWith('P'));
    if (p) {
      const bytes = decodeB86(p.value.slice(1));
      const dec = encryptMode2([...bytes], keys16arr, 1);
      console.log(`\n=== 浏览器 #${round} P len=${p.value.length} dec len=${dec.length} ===`);
      console.log('dec[0-3](uuid):', dec.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('nextarr[0-12]:', dec.slice(4, 17).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // nextarr 结构拆解
      const na = dec.slice(4);
      console.log('nextarr[0]=' + na[0], 'r2mkaTime=' + na.slice(1, 5).map(b => b.toString(16)).join(''), 'startTime=' + na.slice(5, 9).map(b => b.toString(16)).join(''));
      const k2 = na.slice(9, 9 + 48);
      console.log('提取 keys2 == cd keys2:', JSON.stringify(k2) === JSON.stringify(keys2.slice(0, 48)));
      const flag = na[57];
      console.log('flag=' + flag.toString(16), 'basearrEncrypt len=' + (na.length - 58));
      const be = na.slice(58);
      // 解密 basearrEncrypt
      const tmp = encryptMode2([...be], keys17arr, 0);
      // xor 逆（前 16 字节）
      const huff = tmp.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
      const base = huffmanDecode(huff);
      console.log('basearr 明文 len:', base.length);
      console.log('basearr[0-31]:', base.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
      basearrs.push(base);
    }
    await page.close();
  }
  await browser.close();

  // 与 len243-nx.js 样本对比
  const sample = require(path.join(ROOT, 'src/handler/basearr/len243-nx.js')).__proto__;
  // 直接读文件提取 NX_BASEARR_SAMPLE
  const src = fs.readFileSync(path.join(ROOT, 'src/handler/basearr/len243-nx.js'), 'utf8');
  const arrM = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  if (arrM) {
    const sampleArr = arrM[1].split(',').map(s => parseInt(s.trim())).filter(v => !isNaN(v));
    console.log('\n=== 与 len243-nx.js 样本对比 ===');
    console.log('样本 len:', sampleArr.length);
    if (basearrs[0]) {
      const same = basearrs[0].map((v, i) => v === sampleArr[i]).filter(Boolean).length;
      console.log('相同字节:', same, '/', Math.max(basearrs[0].length, sampleArr.length));
      console.log('本会话 basearr[0-31]:', basearrs[0].slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('样本   basearr[0-31]:', sampleArr.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // 稳定段对比（明文层面 65-80）
      console.log('本会话 [65-80]:', basearrs[0].slice(65, 81).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('样本   [65-80]:', sampleArr.slice(65, 81).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
