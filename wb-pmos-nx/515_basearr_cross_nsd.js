/**
 * 515_basearr_cross_nsd.js
 * 决定性验证：basearr 明文跨 nsd/cd 是否稳定？
 * 若稳定（仅时间戳/随机段变）→ 环境指纹是固定常量 → 纯算法可固化
 * 同时对比 jsdom basearr 明文 vs 浏览器 basearr 明文（同 nsd/cd）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { JSDOM } = require('jsdom');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
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
let encCfg = null, byLenMap = null, maxCodeLen = 0;
function initHuff() {
  if (encCfg) return;
  encCfg = getEncryptConfig(getTree());
  byLenMap = {};
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxCodeLen) maxCodeLen = c.val;
  }
}
function huffmanDecode(enc) {
  initHuff();
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const m = byLenMap[val];
      if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0; }
      if (val > maxCodeLen) { key = 0; val = 0; }
    }
  }
  return ans;
}
function deriveKeysFromCd(ts) {
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
  return deriveKeys(decryptCd(ts.cd));
}
function reverseBasearr(pVal, der, enc2, addTime) {
  const keys2 = der.keys[2], pureK17 = der.keys[17];
  const keys16arr = addTime([...K16], 0, 1 / 256)[0];
  const keys17arr = addTime([...pureK17], 0, 1 / 256)[0];
  const dec = enc2([...decodeB86(pVal.slice(1))], keys16arr, 1);
  const na = dec.slice(4);
  const beLen = na[60];
  const be = na.slice(61, 61 + beLen);
  const tmp = enc2([...be], keys17arr, 0);
  const huff = tmp.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
  return { basearr: huffmanDecode(huff), beLen, decLen: dec.length };
}

(async () => {
  const ch1 = await httpsGet(TARGET);
  const ch2 = await httpsGet(TARGET);
  if (ch1.status !== 412 || ch2.status !== 412) { console.log('挑战失败', ch1.status, ch2.status); process.exit(1); }
  const m1 = ch1.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const m2 = ch2.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m1 || !m2) { console.log('nsd 解析失败'); process.exit(1); }
  const ts1 = { nsd: +m1[1], cd: m1[2] };
  const ts2 = { nsd: +m2[1], cd: m2[2] };
  console.log('挑战1 nsd=' + ts1.nsd + ' 挑战2 nsd=' + ts2.nsd + ' (相同:' + (ts1.nsd === ts2.nsd) + ')');

  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  require(path.join(ROOT, 'src/handler/parser/constData')).init();
  const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
  const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));

  const der1 = deriveKeysFromCd(ts1);
  const der2 = deriveKeysFromCd(ts2);
  console.log('挑战1 keys2 前8:', der1.keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('挑战2 keys2 前8:', der2.keys[2].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 浏览器两个挑战
  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const bRes = [];
  for (const [i, ch, ts, der] of [[0, ch1, ts1, der1], [1, ch2, ts2, der2]]) {
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(9000);
    const ck = await context.cookies();
    const p = ck.find(c => c.name.endsWith('P'));
    if (p) bRes.push({ p: p.value, der });
    console.log(`浏览器挑战${i + 1} P len=${p ? p.value.length : '无'}`);
    await page.close();
  }
  await browser.close();

  // jsdom 挑战1
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true, resources: 'usable',
  });
  const { window } = dom;
  window.$_ts = { nsd: ts1.nsd, cd: ts1.cd };
  const cookiesWritten = [];
  let cookieJar = '';
  Object.defineProperty(window.document, 'cookie', {
    get() { return cookieJar; },
    set(v) { cookiesWritten.push(v); cookieJar = cookieJar ? cookieJar + '; ' + v : v; },
    configurable: true,
  });
  window.addEventListener('error', () => {});
  try { window.eval(outerJsCode); } catch (e) {}
  await new Promise(r => setTimeout(r, 12000));
  const jsdomP = cookiesWritten.map(c => c.split(';')[0]).find(c => /P=/.test(c));

  // 逆向所有 basearr
  const b1 = bRes[0] ? reverseBasearr(bRes[0].p, bRes[0].der, encryptMode2, numarrAddTime) : null;
  const b2 = bRes[1] ? reverseBasearr(bRes[1].p, bRes[1].der, encryptMode2, numarrAddTime) : null;
  const j1 = jsdomP ? reverseBasearr(jsdomP.split('=')[1], der1, encryptMode2, numarrAddTime) : null;

  console.log('\n=== basearr 明文对比 ===');
  console.log('浏览器B1 len:', b1 ? b1.basearr.length : '-', '浏览器B2 len:', b2 ? b2.basearr.length : '-', 'jsdomJ1 len:', j1 ? j1.basearr.length : '-');
  if (b1 && b2) {
    const same = b1.basearr.map((v, i) => v === b2.basearr[i]).filter(Boolean).length;
    console.log('\n★ B1 vs B2（跨 nsd/cd）相同:', same, '/', Math.min(b1.basearr.length, b2.basearr.length));
    const diff = [];
    for (let i = 0; i < Math.min(b1.basearr.length, b2.basearr.length); i++) if (b1.basearr[i] !== b2.basearr[i]) diff.push(i);
    console.log('B1/B2 差异索引:', diff.join(','));
    console.log('B1 前60:', b1.basearr.slice(0, 60).map(x => x.toString(16).padStart(2, '0')).join(' '));
    console.log('B2 前60:', b2.basearr.slice(0, 60).map(x => x.toString(16).padStart(2, '0')).join(' '));
  }
  if (b1 && j1) {
    const same = b1.basearr.map((v, i) => v === j1.basearr[i]).filter(Boolean).length;
    console.log('\n★ B1 vs J1（同 nsd/cd）相同:', same, '/', Math.min(b1.basearr.length, j1.basearr.length));
    const diff = [];
    for (let i = 0; i < Math.min(b1.basearr.length, j1.basearr.length); i++) if (b1.basearr[i] !== j1.basearr[i]) diff.push(i);
    console.log('B1/J1 差异索引:', diff.join(','));
    console.log('J1 前60:', j1.basearr.slice(0, 60).map(x => x.toString(16).padStart(2, '0')).join(' '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
