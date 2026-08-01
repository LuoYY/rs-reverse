/**
 * 276_browser_keys_override.js
 *
 * 用浏览器权威 keys（browserKeys 的 keys2/keys17）+ 317B basearr 重现 cookie 重放测试
 * 验证 keys2/keys17 环境相关是否 412 根因
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const PROXY = { host: '119.167.233.189', port: 2018, auth: '74940609:aFmWc5Fs' };

function httpRequest(url, headers, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: PROXY.host, port: PROXY.port, path: u.href,
      method, headers: { ...headers, Host: u.host },
      rejectUnauthorized: false,
    };
    if (PROXY.auth) opts.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(PROXY.auth).toString('base64');
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
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

  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  const B86_64 = NX_BS.slice(0, 64);

  // 浏览器权威参数（sync 会话）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  const bCookie = sync.cookies.find(c => c.name.endsWith('P')).value;
  const oName = sync.cookies.find(c => c.name.endsWith('O')).name;

  // 317B basearr
  const ba = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_browser_plain.json'))).basearr;
  console.log('浏览器 basearr:', ba.length, 'B');
  console.log('browser keys2:', JSON.stringify(bk.keys2).substring(0, 50));
  console.log('browser keys17:', JSON.stringify(bk.keys17));
  console.log('browser keys16:', JSON.stringify(bk.keys16));

  // nextarr head（从浏览器 nextarr）
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, 'browser_nextarr_' + sync.challenge.nsd + '.json')));
  const nextarr = nd.nextarr;
  const head = nextarr.slice(0, 11);
  console.log('head:', head.join(','));

  // 重现 cookie（用浏览器 keys2/keys17 + 317B basearr）
  const keys2 = bk.keys2;
  const k17 = bk.keys17;
  const k16 = bk.keys16;

  const E = numarrEncrypt([...ba]);
  console.log('\nnumarrEncrypt(basearr):', E.length, 'B');
  const X = E.slice();
  for (let i = 0; i < 16 && i < X.length; i++) X[i] ^= keys2[i];
  const arr17 = numarrAddTime([...k17], 0, 1 / 256)[0];
  const baseEnc = encryptMode1([...X], arr17, 0);
  console.log('basearrEncrypt:', baseEnc.length, 'B');

  // nextarr 构建
  const flag = 128 | (baseEnc.length >> 8);
  const N = baseEnc.length & 255;
  const nx = [...head, 48, ...keys2, flag, N, ...baseEnc];
  console.log('nextarr:', nx.length, 'B');

  // 外层
  const u4 = parser.numToNumarr4(parser.uuid(nx));
  const P = [...u4, ...nx];
  console.log('P:', P.length, 'B');
  const arr16 = numarrAddTime([...k16], 0, 1 / 256)[0];
  const encOut = encryptMode1([...P], arr16, 1, 0.5);
  const cookie = 'a' + numarr2string([...encOut], B86_64.split(''));
  console.log('重现 cookie:', cookie.length, '字符 前 8:', cookie.substring(0, 8));

  // 浏览器原 cookie
  console.log('浏览器 cookie:', bCookie.length, '字符 前 8:', bCookie.substring(0, 8));

  // 重放测试
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const oCookie = sync.cookies.find(c => c.name.endsWith('O'));
  const pCookieName = sync.cookies.find(c => c.name.endsWith('P')).name;
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  console.log('\n=== 重放 ===');
  let r1 = await httpRequest(TARGET, { 'User-Agent': UA });
  console.log('无 cookie:', r1.status);
  r1 = await httpRequest(TARGET, { 'User-Agent': UA, Cookie: oCookie.name + '=' + oCookie.value + '; ' + pCookieName + '=' + bCookie });
  console.log('浏览器原 cookie:', r1.status);
  r1 = await httpRequest(TARGET, { 'User-Agent': UA, Cookie: oCookie.name + '=' + oCookie.value + '; ' + pCookieName + '=' + cookie });
  console.log('重现 cookie:', r1.status);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
