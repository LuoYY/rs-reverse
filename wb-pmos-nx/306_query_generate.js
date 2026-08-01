/**
 * 306_query_generate.js
 *
 * 生成 nx query（xj 逻辑 + 字节4=4 + 'a'前缀 + b86）+ API 测试
 * keys17 变体：纯算法 / 浏览器数组陷阱
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const API = 'https://pmos.nx.sgcc.com.cn:10443/px-gateway/GatewayConfig/getGatewayConfig';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const PROXY_STR = 'http://74940609:aFmWc5Fs@119.167.233.189:2018';
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
function curlReq(cookieStr, query, url = API, method = 'POST') {
  try {
    const full = url + '?' + query;
    const cmd = `curl -x ${PROXY_STR} -k -sS -o /tmp/curl_out.txt -w "%{http_code}" --connect-timeout 15 --max-time 30 -A "${UA}" -H "Cookie: ${cookieStr}" -H "Content-Type: application/json" -X ${method} -d '{}' "${full}"`;
    const code = execSync(cmd, { encoding: 'utf8' }).trim();
    const resp = fs.readFileSync('/tmp/curl_out.txt', 'utf8');
    return code + ' ' + resp.substring(0, 60);
  } catch (e) { return 'ERR'; }
}

async function collect() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  let challenge = null, pCookie = '', pCookieName = '', oCookie = null;
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
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
    try { await page.goto(TARGET, { timeout: 90000 }); } catch (e) { console.log('goto:', e.message.substring(0, 40)); }
    await page.waitForTimeout(6000);
    try { await page.reload({ timeout: 90000 }); } catch (e) { console.log('reload:', e.message.substring(0, 40)); }
    await page.waitForTimeout(15000);
    await cdp.send('Runtime.evaluate', { expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`, returnByValue: true });
    await page.waitForTimeout(5000);
    const cks = await context.cookies();
    const pc = cks.find(c => c.name.endsWith('P'));
    if (pc) { pCookie = pc.value; pCookieName = pc.name; }
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc;
    await context.close();
  } finally { await browser.close(); }
  if (!challenge || !pCookie) return null;
  return { nsd: challenge.nsd, cd: challenge.cd, pCookie, oCookie, pCookieName };
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const numarr2string = require('@src/handler/parser/common/numarr2string');

  const s = await collect();
  if (!s) { console.log('采集失败'); process.exit(1); }
  console.log('采集: nsd=' + s.nsd, 'P len=' + s.pCookie.length);
  const oStr = s.oCookie ? s.oCookie.name + '=' + s.oCookie.value : '';

  // keys2（从 P cookie）+ keys17 纯算法
  const cdArr = decryptCd(s.cd);
  const der = deriveKeys(cdArr);
  if (!der) { console.log('keys 推导失败'); process.exit(1); }
  const pureK17 = der.keys[17];
  const C = decodeB86(s.pCookie.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const browserK2 = dec.slice(4).slice(11, 59);
  console.log('keys2:', browserK2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('pure keys17:', pureK17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 生成 query（keys17 变体）
  const urlPath = '/px-gateway/GatewayConfig/getGatewayConfig';
  const queryName = der.keys[7] ? der.keys[7].length > 20 ? (() => { const parts = der.keys[7].slice(1, 60); return 'MurR7rxG'; })() : 'MurR7rxG' : 'MurR7rxG';
  const queryNameReal = (() => {
    // nx query 参数名（从挑战页/keys 派生）——先用捕获的
    return 'MurR7rxG';
  })();

  const keys17Cands = { 'pure': pureK17 };
  for (const [kn, k17] of Object.entries(keys17Cands)) {
    try {
      const randByte = () => Math.floor(Math.random() * 256);
      const crcUrl = crc32b(Buffer.from(urlPath.toUpperCase()));
      const plain24 = [
        browserK2[0] ^ PREFIX_MASK[0], browserK2[1] ^ PREFIX_MASK[1], browserK2[2], browserK2[3] ^ PREFIX_MASK[3],
        browserK2[4], browserK2[5] ^ PREFIX_MASK[5], browserK2[6], browserK2[7] ^ PREFIX_MASK[7],
        randByte(), randByte(), randByte(), randByte(), randByte(),
        randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
        (crcUrl >>> 24) & 255, (crcUrl >>> 16) & 255, (crcUrl >>> 8) & 255, crcUrl & 255,
      ];
      const [key21] = numarrAddTime([...k17], Math.floor(Date.now() / 1000), Math.random());
      const requestData = encryptMode1(plain24, key21, 0);
      const body = [4, 0, 48, ...browserK2, 32, ...requestData];
      const crc = crc32b(Buffer.from(body));
      const q = 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64.split(''));
      const cookieStr = oStr + '; ' + s.pCookieName + '=' + s.pCookie;
      console.log('\n[' + kn + '] query 名:', queryNameReal, '值长:', q.length);
      console.log('  API 用浏览器原 cookie:', curlReq(cookieStr, queryNameReal + '=' + q));
      console.log('  页面 GET:', curlReq(cookieStr, '', TARGET, 'GET'));
    } catch (e) { console.log('[' + kn + '] 错误:', e.message.substring(0, 60)); }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
