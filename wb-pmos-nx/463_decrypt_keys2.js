/**
 * 463_decrypt_keys2.js
 * 决定性实验：固定挑战页（同 nsd/cd），浏览器 3 次加载，解密 P cookie 提取 keys2 对比
 * keys2 相同 → f(nsd,cd) 纯算法可行；不同 → 依赖环境/随机
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const http = require('http');
const tls = require('tls');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const PROXY = { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' };
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
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
function hex8(arr, off) { return arr.slice(off, off + 8).map(b => b.toString(16).padStart(2, '0')).join(' '); }
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
      let body = '';
      tlsSock.on('data', d => body += d);
      tlsSock.on('end', () => {
        const headEnd = body.indexOf('\r\n\r\n');
        resolve({ status: headEnd >= 0 ? parseInt((body.substring(0, headEnd).split(' ')[1] || '').trim()) : 'ERR', body: body.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}

(async () => {
  // 1. 捕获挑战页 HTML
  const ch = await httpsGet(TARGET);
  if (ch.status !== 412) { console.log('挑战:', ch.status); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无 nsd/cd'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  console.log('固定挑战页 nsd=' + nsd);

  // 2. 浏览器 3 次加载同挑战页
  const browser = await chromium.launch({ headless: true, proxy: PROXY, args: ['--ignore-certificate-errors', '--no-sandbox'] });
  const pCookies = [];
  for (let round = 1; round <= 3; round++) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
    const page = await context.newPage();
    await page.route('**/pmos.nx.sgcc.com.cn:10443/', (route) => {
      route.fulfill({ status: 412, contentType: 'text/html', body: ch.body });
    });
    try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
    await page.waitForTimeout(8000);
    const ck = await context.cookies();
    const pCookie = ck.find(c => c.name.endsWith('P'));
    if (pCookie) pCookies.push(pCookie.value);
    await context.close();
  }
  await browser.close();
  console.log('P cookie 数:', pCookies.length);

  // 3. 解密 P cookie → keys2
  const cdArr = decryptCd(cd);
  console.log('cdArr len:', cdArr.length);
  const keys2List = [];
  for (let i = 0; i < pCookies.length; i++) {
    const p = pCookies[i];
    const C = decodeB86(p.slice(1));
    if (!C) { console.log(`#${i + 1} 解码失败`); continue; }
    // 解密 nextarr：encryptMode2(C, keys16arr, 1)
    // keys16arr = numarrAddTime([...K16], 0, 1/256)[0]
    const ROOT2 = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
    try { require('module-alias')(path.dirname(require(path.join(ROOT2, 'utils/paths.js')).package)); } catch (e) {}
    require(path.join(ROOT2, 'src/handler/parser/constData')).init();
    const { encryptMode2 } = require(path.join(ROOT2, 'src/handler/parser/common/modeEncrypt'));
    const numarrAddTime = require(path.join(ROOT2, 'src/handler/parser/common/numarrAddTime'));
    const arr = numarrAddTime([...K16], 0, 1 / 256)[0];
    const dec = encryptMode2([...C], arr, 1);
    // 找 keys2（dec.slice(15,63) 或搜索 [4,0,48] 标记）
    const k2 = dec.slice(15, 63);
    keys2List.push(k2);
    console.log(`#${i + 1} keys2: ${hex8(k2, 0)} ...`);
    // 也打印 dec 结构头
    console.log(`  dec head: ${dec.slice(0, 15).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }

  // 4. 对比
  console.log('\n=== 对比 ===');
  if (keys2List.length >= 2) {
    const same12 = keys2List[0].every((v, i) => v === keys2List[1][i]);
    console.log('keys2 #1==#2:', same12);
    if (keys2List.length >= 3) {
      const same23 = keys2List[1].every((v, i) => v === keys2List[2][i]);
      console.log('keys2 #2==#3:', same23);
    }
    console.log('结论:', same12 ? '★ keys2 稳定（纯算法可行！只依赖 nsd/cd）' : 'keys2 变化（依赖环境/随机）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
