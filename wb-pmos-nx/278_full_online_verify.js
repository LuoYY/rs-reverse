/**
 * 278_full_online_verify.js
 *
 * 全流程在线验证：
 * 1. patchright 采集新浏览器会话（cd + P cookie）
 * 2. 纯算法推导 keys
 * 3. 解密 cookie → nextarr → basearr
 * 4. 重现 cookie
 * 5. curl 重放（浏览器原 + 重现）
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
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const PROXY_STR = 'http://74940609:aFmWc5Fs@119.167.233.189:2018';

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

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
      if (k16 && k16.length === 16 && k16.every((v, i) => v === K16[i])) {
        return { off, keys };
      }
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
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function numarrDecrypt(bytes) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (node && node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
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
    console.log('nsd:', challenge ? challenge.nsd : '无', 'P:', pCookie.length);
    await context.close();
  } finally { await browser.close(); }
  if (!challenge || !pCookie) return null;
  return { nsd: challenge.nsd, cd: challenge.cd, pCookie, oCookie, pCookieName };
}

function curlReplay(cookieStr) {
  try {
    const cmd = `curl -x ${PROXY_STR} -k -sS -o /dev/null -w "%{http_code}" --connect-timeout 15 --max-time 25 -A "${UA}" -H "Cookie: ${cookieStr}" "${TARGET}"`;
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (e) { return 'ERR'; }
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const numarr2string = require('@src/handler/parser/common/numarr2string');

  // 采集
  const s = await collect();
  if (!s) { console.log('采集失败'); process.exit(1); }
  console.log('采集: nsd=' + s.nsd, 'cd len=' + s.cd.length, 'P=' + s.pCookie.length);
  fs.writeFileSync(path.join(OUT, 'fresh_' + s.nsd + '.json'), JSON.stringify(s));

  // 纯算法 keys
  const cdArr = decryptCd(s.cd);
  const der = deriveKeys(cdArr);
  if (!der) { console.log('keys 推导失败'); process.exit(1); }
  console.log('offset:', JSON.stringify(der.off));
  console.log('pure keys17:', JSON.stringify(der.keys[17]));

  // 外层解密 → nextarr → keys2 位置
  const C = decodeB86(s.pCookie.slice(1));
  const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const dec = encryptMode2([...C], arr, 1);
  const nextarr = dec.slice(4);
  const u4 = parser.numToNumarr4(parser.uuid(nextarr));
  console.log('外层 uuid:', u4.every((v, i) => v === dec[i]) ? 'YES' : 'NO');
  console.log('nextarr[0]:', nextarr[0], 'len:', nextarr.length);

  // 找 keys2（纯算法前缀在 nextarr？）
  const p8 = der.keys[2].slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === p8[j])) { k2pos = i; break; }
  }
  const browserK2 = k2pos >= 0 ? nextarr.slice(k2pos, k2pos + 48) : nextarr.slice(11, 59);
  console.log('纯算法 keys2 在 nextarr @', k2pos, k2pos >= 0 ? '(一致!)' : '(不一致! 用位置11)');

  // 内层解密 basearr
  const k17 = der.keys[17];
  const flag = nextarr[k2pos >= 0 ? k2pos + 48 : 59];
  const N = nextarr[k2pos >= 0 ? k2pos + 49 : 60];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const baseEnc = nextarr.slice((k2pos >= 0 ? k2pos + 50 : 61), (k2pos >= 0 ? k2pos + 50 : 61) + len);
  console.log('flag=' + flag, 'basearrEncrypt:', baseEnc.length, 'B');
  const arr17 = numarrAddTime([...k17], 0, 1 / 256)[0];
  let X = null;
  try { X = encryptMode2([...baseEnc], arr17, 0); } catch (e) { console.log('内层解密错误:', e.message.substring(0, 40)); }
  if (X) {
    const E = X.slice();
    for (let i = 0; i < 16 && i < E.length; i++) E[i] ^= browserK2[i];
    const ba = numarrDecrypt(E);
    console.log('basearr:', ba.length, 'B 首 8:', ba.slice(0, 8).join(','));
    fs.writeFileSync(path.join(OUT, 'basearr_fresh_' + s.nsd + '.json'), JSON.stringify({ basearr: ba, browserK2, k17 }));
    // 重现 cookie
    const E2 = numarrEncrypt([...ba]);
    const X2 = E2.slice();
    for (let i = 0; i < 16 && i < X2.length; i++) X2[i] ^= browserK2[i];
    const baseEnc2 = encryptMode1([...X2], arr17, 0);
    const flag2 = 128 | (baseEnc2.length >> 8);
    const N2 = baseEnc2.length & 255;
    const nx = [...nextarr.slice(0, 11), 48, ...browserK2, flag2, N2, ...baseEnc2];
    const u42 = parser.numToNumarr4(parser.uuid(nx));
    const arr16 = numarrAddTime([...K16], 0, 1 / 256)[0];
    const encOut = encryptMode1([...u42, ...nx], arr16, 1, 0.5);
    const cookie = 'a' + numarr2string([...encOut], B86_64.split(''));
    console.log('重现 cookie 前 22:', cookie.substring(0, 22), 'len:', cookie.length);

    // 重放
    const oStr = s.oCookie ? s.oCookie.name + '=' + s.oCookie.value : '';
    console.log('\n=== 重放 ===');
    console.log('无 cookie:', curlReplay(''));
    console.log('浏览器原 cookie:', curlReplay(oStr + '; ' + s.pCookieName + '=' + s.pCookie));
    console.log('重现 cookie:', curlReplay(oStr + '; ' + s.pCookieName + '=' + cookie));
  } else {
    console.log('内层解密失败');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
