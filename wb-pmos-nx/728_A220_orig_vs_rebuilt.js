/**
 * 728_A216_dynamic_replay_test.js
 * 决定性实验：修改 base[24-39] 各段为任意值，验证服务器校验范围
 * - V1 改[24-25] → 200?（会话段）
 * - V2 改[26-31] → 200/400?（环境检测段）
 * - V3 改[32-39] → 400?（固定段）
 * 通过 curl + O/P 重放测试 API
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
  const curlCmd = `curl -s -o /tmp/216_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 '${apiUrl}' \
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
    const body = fs.readFileSync('/tmp/216_api.html', 'utf8');
    console.log(label + ':', code, body.substring(0, 70).replace(/\n/g, ' '));
    return code;
  } catch (e) {
    console.log(label + ': err', (e.stdout || '').toString().trim());
    return 'ERR';
  }
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const ts = { nsd: +m[1], cd: m[2] };
  const oCookie = ch.setCookies.find(c => /O=/.test(c)) || '';
  console.log('nsd=' + ts.nsd);

  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');
  const uuidFn = require('@src/handler/parser/common/uuid');
  const xor = require('@src/handler/parser/common/tools').xor;
  const der = deriveKeysFromCd(ts.cd);
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  if (!der) { console.log('keys 派生失败'); process.exit(1); }

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(9000);
  const ck = await context.cookies();
  const pA = ck.find(c => c.name.endsWith('P'));
  const oB = ck.find(c => c.name.endsWith('O'));
  const oName = oB ? oB.name : null;
  const oVal = oB ? oB.value : null;
  console.log('浏览器会话 O cookie:', oName, oVal ? oVal.substring(0, 30) + '...' : '无');
  await browser.close();
  if (!pA) { console.log('无 P'); process.exit(1); }
  const pName = pA.name;

  // === 530 精确复现（立即执行，无诊断）===
  const dec530 = encryptMode2([...decodeB86(pA.value.slice(1))], keys16arr, 1);
  const na530 = dec530.slice(4);
  const now530 = Math.floor(Date.now() / 1000);
  const n4530 = numToNumarr4(now530);
  const na530m = [...na530];
  na530m[2] = n4530[0]; na530m[3] = n4530[1]; na530m[4] = n4530[2]; na530m[5] = n4530[3];
  na530m[6] = n4530[0]; na530m[7] = n4530[1]; na530m[8] = n4530[2]; na530m[9] = n4530[3];
  const c530 = 'a' + numarr2string(encryptMode1([...numToNumarr4(uuidFn(na530m)), ...na530m], keys16arr, 1), B86_64);
  console.log('立即530复现 c530 len:', c530.length);
  fs.writeFileSync('/tmp/c530.txt', c530);

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
  const base = raw.slice(0, bestLen);
  console.log('base len:', base.length, '头:', base.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('[24-25]:', base.slice(24, 26).map(b => b.toString(16).padStart(2, '0')).join(' '), '[26-31]:', base.slice(26, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // === 配对关系分析 ===
  const r2mka = na.slice(2, 6);
  const start = na.slice(6, 10);
  const t24 = base.slice(22, 26);
  console.log('\n=== base[22-25] vs na r2mka/start ===');
  console.log('base[22-25]:', t24.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('na r2mka   :', r2mka.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('na start   :', start.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('[22-25]^r2mka:', t24.map((v, i) => (v ^ r2mka[i]).toString(16).padStart(2, '0')).join(' '));
  console.log('[22-25]^start:', t24.map((v, i) => (v ^ start[i]).toString(16).padStart(2, '0')).join(' '));
  console.log('r2mka 大端值:', ((r2mka[0] << 24) | (r2mka[1] << 16) | (r2mka[2] << 8) | r2mka[3]) >>> 0, 'start 大端值:', ((start[0] << 24) | (start[1] << 16) | (start[2] << 8) | start[3]) >>> 0);
  fs.writeFileSync('/tmp/nx_pair_latest.json', JSON.stringify({ base, na, r2mka, start, t24, nsd: ts.nsd }));
  console.log('已保存 /tmp/nx_pair_latest.json');

  // === 编码对比诊断 ===
  console.log('\n=== huff 编码对比（不同 pad）===');
  console.log('原始 huff len:', huff.length, ' 原始 huff 前16:', huff.slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(' '));
  for (const pad of [0x68, 0x78, 0x58, 0x88, 0x00, 0xb8]) {
    const enc = numarrEncrypt68(base, pad);
    const s = `pad=0x${pad.toString(16)}: enc len=${enc.length} vs huff=${huff.length} (diff=${huff.length - enc.length})`;
    if (enc.length === huff.length) {
      let diff = 0, fd = -1;
      for (let i = 0; i < enc.length; i++) if (enc[i] !== huff[i]) { diff++; if (fd < 0) fd = i; }
      console.log(s + ` 字节差异=${diff} 首异@${fd} enc尾=${enc.slice(-3).map(x => x.toString(16).padStart(2, '0')).join(' ')} huff尾=${huff.slice(-3).map(x => x.toString(16).padStart(2, '0')).join(' ')} raw len=${raw.length} bestLen=${bestLen}`);
    } else {
      console.log(s);
    }
  }
  // 尝试 base+1 字节（raw[bestLen]）重新编码
  const baseP1 = raw.slice(0, bestLen + 1);
  const encP1 = numarrEncrypt68(baseP1);
  console.log(`base+1(len=${baseP1.length}) enc len=${encP1.length} 与huff ${encP1.length === huff.length ? '等长' : '不等'}`);
  if (encP1.length === huff.length) {
    let diff = 0, fd = -1;
    for (let i = 0; i < encP1.length; i++) if (encP1[i] !== huff[i]) { diff++; if (fd < 0) fd = i; }
    console.log(`  base+1 编码差异=${diff} 首异@${fd}`);
  }
  // base-1
  const baseM1 = raw.slice(0, Math.max(1, bestLen - 1));
  const encM1 = numarrEncrypt68(baseM1);
  console.log(`base-1(len=${baseM1.length}) enc len=${encM1.length} 与huff ${encM1.length === huff.length ? '等长' : '不等'}`);

  const now = Math.floor(Date.now() / 1000);
  const mkCookie = (barr, naMod) => {
    const huffNew = numarrEncrypt68(barr);
    const xorNew = [...huffNew];
    xor(xorNew, der.keys[2], 16);
    const beNew = encryptMode1(xorNew, numarrAddTime([...der.keys[17]], now, Math.random())[0], 0);
    let naNew = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...der.keys[2],
      beNew.length >> 8 & 255 | 128, beNew.length & 255, ...beNew,
    ];
    if (naMod) naMod(naNew);
    const u4 = numToNumarr4(uuidFn(naNew));
    return 'a' + numarr2string(encryptMode1([...u4, ...naNew], keys16arr, 1), B86_64);
  };
  const r2mkaNum = ((r2mka[0] << 24) | (r2mka[1] << 16) | (r2mka[2] << 8) | r2mka[3]) >>> 0;
  const startNum = ((start[0] << 24) | (start[1] << 16) | (start[2] << 8) | start[3]) >>> 0;
  console.log('r2mkaNum =', r2mkaNum, 'startNum =', startNum);
  // mkCookie2: 用指定 time 加密 be
  const mkCookie2 = (barr, time, naMod) => {
    const huffNew = numarrEncrypt68(barr);
    const xorNew = [...huffNew];
    xor(xorNew, der.keys[2], 16);
    const beNew = encryptMode1(xorNew, numarrAddTime([...der.keys[17]], time, Math.random())[0], 0);
    let naNew = [
      4, 8, ...numToNumarr4(time), ...numToNumarr4(time), 48, ...der.keys[2],
      beNew.length >> 8 & 255 | 128, beNew.length & 255, ...beNew,
    ];
    if (naMod) naMod(naNew);
    const u4 = numToNumarr4(uuidFn(naNew));
    return 'a' + numarr2string(encryptMode1([...u4, ...naNew], keys16arr, 1), B86_64);
  };
  // uuid 诊断
  const decOrig = encryptMode2([...decodeB86(pA.value.slice(1))], keys16arr, 1);
  console.log('\n=== uuid 诊断 ===');
  console.log('原始 uuid4:', decOrig.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  const uCalc = uuidFn(na);
  console.log('uuidFn(na) 4B:', numToNumarr4(uCalc).map(b => b.toString(16).padStart(2, '0')).join(' '), '一致:', decOrig.slice(0, 4).every((v, i) => v === numToNumarr4(uCalc)[i]));
  const mkOrigNa = (u4) => {
    return 'a' + numarr2string(encryptMode1([...(u4 || numToNumarr4(uCalc)), ...na], keys16arr, 1), B86_64);
  };
  const cV7b = mkOrigNa();
  const cV7c = mkOrigNa(decOrig.slice(0, 4));
  console.log('V7b(新uuid+原na) len:', cV7b.length, 'V7c(原uuid+原na) len:', cV7c.length);
  const decV7c = encryptMode2([...decodeB86(cV7c.slice(1))], keys16arr, 1);
  console.log('V7c 解码 uuid4:', decV7c.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('V7c 解码 na 与原始 na 一致:', decV7c.slice(4).every((v, i) => v === na[i]));
  // 对比密文（b86 解码后）
  const rawOrig = decodeB86(pA.value.slice(1));
  const rawV7c = decodeB86(cV7c.slice(1));
  console.log('原始 cookie b86 解码 len:', rawOrig.length, 'V7c len:', rawV7c.length);
  console.log('原始 前16:', rawOrig.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('V7c  前16:', rawV7c.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys16arr(前16):', keys16arr.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('O cookie:', oCookie.substring(0, 60));
  // 测试：用原始加密参数（time=na 时间戳, random 固定）
  const mkOrigNa2 = (time) => {
    const key16 = numarrAddTime([...K16], time, 1 / 256)[0];
    return 'a' + numarr2string(encryptMode1([...decOrig.slice(0, 4), ...na], key16, 1), B86_64);
  };
  const cV7d = mkOrigNa2(r2mkaNum);
  console.log('V7d(原na+原时间戳keys16) len:', cV7d.length);
  // 逆推外层加密密钥: 原始密文 = encryptMode1([uuid4,...na], key16, 1)
  // 暴力搜索 time (numarrAddTime(K16, time, 1/256)[0]) 使 encryptMode1 输出 == 原始密文
  console.log('\\n=== 逆推外层密钥 ===');
  const rawOrigFull = decodeB86(pA.value.slice(1));
  console.log('原始密文 len:', rawOrigFull.length, '首4:', rawOrigFull.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  // 尝试 time 搜索（na 时间戳附近 ±60s）
  let found = null;
  for (let dt = -120; dt <= 120 && !found; dt++) {
    const t = r2mkaNum + dt;
    const key16t = numarrAddTime([...K16], t, 1 / 256)[0];
    const enc = encryptMode1([...decOrig.slice(0, 4), ...na], key16t, 1);
    if (enc.length === rawOrigFull.length && enc.every((v, i) => v === rawOrigFull[i])) found = t;
  }
  console.log('暴力搜索 keys16 time:', found !== null ? found + ' (dt=' + (found - r2mkaNum) + ')' : '未找到');
  // 尝试 O cookie 解密看结构
  if (oVal) {
    try {
      const oRaw = decodeB86(oVal);
      const oDec = encryptMode2([...oRaw], keys16arr, 1);
      console.log('O cookie 解密 len:', oDec.length, '首16:', oDec.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    } catch (e) { console.log('O 解密失败:', e.message.substring(0, 50)); }
  }

  const variants = [];
  variants.push(['V0 原始P直接重放', null, null, null]);
  variants.push(['V7c 原uuid+原na', 'V7C', now, null]);
  variants.push(['V7b 新uuid+原na', 'V7B', now, null]);
  variants.push(['V7d 原na+原时间keys16', 'V7D', now, null]);
  // V8: 530 精确复现（na 时间戳改 now，keys16arr time=0）
  const naV8 = [...na];
  const n4v8 = numToNumarr4(now);
  naV8[2] = n4v8[0]; naV8[3] = n4v8[1]; naV8[4] = n4v8[2]; naV8[5] = n4v8[3];
  naV8[6] = n4v8[0]; naV8[7] = n4v8[1]; naV8[8] = n4v8[2]; naV8[9] = n4v8[3];
  variants.push(['V8 530复现(改na时间戳+keys16)', 'V8', now, null]);
  // V9/V10/V11: 新时间戳 na + 新 be 加密（基于修改的 base）
  const mkNewBe = (barr) => {
    const huffNew = numarrEncrypt68(barr);
    const xorNew = [...huffNew];
    xor(xorNew, der.keys[2], 16);
    const beNew = encryptMode1(xorNew, numarrAddTime([...der.keys[17]], now, Math.random())[0], 0);
    const naNew = [
      4, 8, ...numToNumarr4(now), ...numToNumarr4(now), 48, ...der.keys[2],
      beNew.length >> 8 & 255 | 128, beNew.length & 255, ...beNew,
    ];
    const u4 = numToNumarr4(uuidFn(naNew));
    return 'a' + numarr2string(encryptMode1([...u4, ...naNew], keys16arr, 1), B86_64);
  };
  const baseV9 = [...base]; for (let i = 24; i < 30; i++) baseV9[i] = 0;
  const baseV10 = [...base]; for (let i = 68; i < 93; i++) baseV10[i] = 0;
  const cV9 = mkNewBe(baseV9);
  const cV10 = mkNewBe(baseV10);
  const cV11 = mkNewBe(base);
  variants.push(['V9 新时间戳+base[24-29]=0', 'V9', now, null]);
  variants.push(['V10 新时间戳+base[68:93]=0', 'V10', now, null]);
  variants.push(['V11 新时间戳+base原样新be', 'V11', now, null]);
  variants.push(['V1 重建(now)', [...base], now, null]);
  variants.push(['V1b 重建(r2mka时间)', [...base], r2mkaNum, null]);
  variants.push(['V1c 重建(r2mka时间+保留na时间)', [...base], r2mkaNum, (n) => {
    for (let i = 2; i < 10; i++) n[i] = na[i];
  }]);
  variants.push(['V1d 重建(start时间)', [...base], startNum, null]);
  const bA1 = [...base]; for (let i = 24; i < 26; i++) bA1[i] = 0;
  variants.push(['V2 改[24-25]=0(r2mka时间)', bA1, r2mkaNum, null]);
  const bA3 = [...base]; for (let i = 26; i < 32; i++) bA3[i] = 0;
  variants.push(['V3 改[26-31]=0(r2mka时间)', bA3, r2mkaNum, null]);
  const bA5 = [...base]; for (let i = 68; i < 93; i++) bA5[i] = 0;
  variants.push(['V4 改[68:93]=0(r2mka时间)', bA5, r2mkaNum, null]);
  const bA6 = [...base]; for (let i = 22; i < 29; i++) bA6[i] = 0;
  variants.push(['V5 改[22-28]=0(r2mka时间)', bA6, r2mkaNum, null]);
  const bA7 = [...base]; for (let i = 24; i < 30; i++) bA7[i] = 0;
  variants.push(['V6 改[24-29]=0(r2mka时间)', bA7, r2mkaNum, null]);
  const cookies = variants.map(([name, barr, time, naMod]) => ({
    name,
    c: barr === null ? null : (name === 'V7c 原uuid+原na' ? mkOrigNa(decOrig.slice(0, 4)) : (name === 'V7b 新uuid+原na' ? mkOrigNa() : (name === 'V7d 原na+原时间keys16' ? cV7d : (name === 'V8 530复现(改na时间戳+keys16)' ? (() => { const u4 = numToNumarr4(uuidFn(naV8)); return 'a' + numarr2string(encryptMode1([...u4, ...naV8], keys16arr, 1), B86_64); })() : (name === 'V9 新时间戳+base[24-29]=0' ? cV9 : (name === 'V10 新时间戳+base[68:93]=0' ? cV10 : (name === 'V11 新时间戳+base原样新be' ? cV11 : mkCookie2(barr, time, naMod)))))))),
  }));
  console.log('cookies:', cookies.map(x => x.c ? x.c.length : 'orig').join(', '));
  console.log('浏览器 O 存在:', !!oVal, 'Node O 存在:', oCookie.length > 0);
  console.log('原始 na r2mka:', na.slice(2, 6).map(b => b.toString(16).padStart(2, '0')).join(' '), 'start:', na.slice(6, 10).map(b => b.toString(16).padStart(2, '0')).join(' '));

  const k2 = der.keys[2];
  const randByte = () => Math.floor(Math.random() * 256);
  function genQuery(urlPath) {
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
  const url = (q) => 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + q;
  const qc = genQuery(API);
  runCurl(url(qc), qc, oCookie + '; ' + pName + '=' + c530, 'V530 立即530复现');
  await new Promise(r => setTimeout(r, 1200));
  // V531: 同一 now 的 V8 逻辑（立即）
  const naV8b = [...na530];
  const n4v8b = numToNumarr4(now530);
  naV8b[2] = n4v8b[0]; naV8b[3] = n4v8b[1]; naV8b[4] = n4v8b[2]; naV8b[5] = n4v8b[3];
  naV8b[6] = n4v8b[0]; naV8b[7] = n4v8b[1]; naV8b[8] = n4v8b[2]; naV8b[9] = n4v8b[3];
  const c531 = 'a' + numarr2string(encryptMode1([...numToNumarr4(uuidFn(naV8b)), ...naV8b], keys16arr, 1), B86_64);
  console.log('c530 === c531:', c530 === c531, 'c530 len:', c530.length, 'c531 len:', c531.length);
  await new Promise(r => setTimeout(r, 5000));
  const qc2 = genQuery(API);
  runCurl(url(qc2), qc2, oCookie + '; ' + pName + '=' + c531, 'V531 同now+5s后再跑');
  await new Promise(r => setTimeout(r, 1200));
  for (const { name, c } of cookies) {
    const q = genQuery(API);
    // V0 用 Node O + 原始 P（确认之前 200）；其余用 Node O
    const cookieStr = c === null ? (oCookie + '; ' + pName + '=' + pA.value) : (oCookie + '; ' + pName + '=' + c);
    runCurl(url(q), q, cookieStr, name);
    await new Promise(r => setTimeout(r, 1200));
  }
  // 附加：浏览器 O + 原始 P（对照）
  if (oVal) {
    const q = genQuery(API);
    runCurl(url(q), q, (oName + '=' + oVal) + '; ' + pName + '=' + pA.value, 'X 浏览器O+原始P');
    await new Promise(r => setTimeout(r, 1200));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
