/**
 * 586_full_keys_session.js
 * 同会话：basearr 动态段 vs 全部 keys 数字 + 时间戳 + 循环
 * 目标：找 [24-29] 与 keys21(r2mkaTime)/keys19 的精确关系
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
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4) });
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
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战失败', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { process.exit(1); }
  const ts = { nsd: +m[1], cd: m[2] };
  console.log('nsd=' + ts.nsd);

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => { route.fulfill({ status: 412, contentType: 'text/html', body: ch.body }); });

  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(10000);
  const ck = await context.cookies();
  const p = ck.find(c => c.name.endsWith('P'));
  console.log('P cookie:', p ? 'YES len=' + p.value.length : '无');

  try {
    require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
    require(path.join(ROOT, 'src/handler/parser/constData')).init();
    const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
    const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
    const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
    const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
    const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
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
    function huffmanDecodeRaw(enc) {
      initHuff();
      const ans = [];
      let key = 0, val = 0;
      for (let i = 0; i < enc.length; i++) {
        for (let b = 7; b >= 0; b--) {
          key = (key << 1) | ((enc[i] >> b) & 1);
          val++;
          const mm = byLenMap[val];
          if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
          if (val > maxCodeLen) { key = 0; val = 0; }
        }
      }
      return ans;
    }
    if (p) {
      const dec = encryptMode2([...decodeB86(p.value.slice(1))], keys16arr, 1);
      const na = dec.slice(4);
      const beLen = (na[59] & 0x7f) << 8 | na[60];
      const be = na.slice(61, 61 + beLen);
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
      if (der) {
        const keys17arr = numarrAddTime([...der.keys[17]], 0, 1 / 256)[0];
        const tmp = encryptMode2([...be], keys17arr, 0);
        const huff = tmp.map((v, i) => i < 16 ? (v ^ der.keys[2][i]) : v);
        const raw = huffmanDecodeRaw(huff);
        let bestLen = 0;
        const huffHead = huff.slice(0, huff.length - 1);
        for (let L = raw.length; L >= 1; L--) {
          const enc = require(path.join(ROOT, 'src/handler/parser/common/numarrEncrypt'))(raw.slice(0, L));
          if (JSON.stringify(enc.slice(0, enc.length - 1)) === JSON.stringify(huffHead)) { bestLen = L; break; }
        }
        const base = raw.slice(0, bestLen);
        console.log('\nbasearr 明文 len:', base.length);
        console.log('basearr[24-31]:', base.slice(24, 32).map(x => x.toString(16).padStart(2, '0')).join(' '));

        // 打印全部 keys 数字
        console.log('\n=== keys 数字 ===');
        for (let ki = 0; ki < der.keys.length; ki++) {
          const k = der.keys[ki];
          if (!k) continue;
          const s = k.map(c => String.fromCharCode(c)).join('');
          if (/^\d+$/.test(s)) console.log(`keys[${ki}]: "${s}" = ${parseInt(s, 10)}`);
        }
        // keys21/19 时间戳
        const k21 = parseInt(der.keys[21].map(c => String.fromCharCode(c)).join(''), 10);
        console.log('\nr2mkaTime(keys21):', k21, 'hex:', k21.toString(16));
        // [24-29] 各窗口
        const d25 = base.slice(25, 29).reduce((a, x) => a * 256 + x, 0);
        console.log('[25-28] BE:', d25, 'hex:', base.slice(25, 29).map(x => x.toString(16)).join(''));
        console.log('[26-29] BE:', base.slice(26, 30).reduce((a, x) => a * 256 + x, 0));
        console.log('[24-27] BE:', base.slice(24, 28).reduce((a, x) => a * 256 + x, 0));
        // 差
        console.log('[25-28] - r2mkaTime:', d25 - k21);
        // 时间戳当前
        const now = Math.floor(Date.now() / 1000);
        console.log('now:', now, 'hex:', now.toString(16));
        console.log('now - r2mkaTime:', now - k21);
        // r2mkaTime 小端
        const k21le = der.keys[21].reduce((a, x, i) => a + (x << (8 * i)), 0) >>> 0;
        console.log('r2mkaTime LE:', k21le, 'hex:', k21le.toString(16));
        // keys19
        const k19n = parseInt(der.keys[19].map(c => String.fromCharCode(c)).join(''), 10);
        console.log('keys19:', k19n, 'hex:', k19n.toString(16));
        console.log('[26-29] - keys19:', base.slice(26, 30).reduce((a, x) => a * 256 + x, 0) - k19n);
      }
    }
  } catch (e) { console.log('逆向失败:', e.message.substring(0, 80)); }
  await page.close();
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
