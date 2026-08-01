/**
 * 277_curl_replay.js
 *
 * 用浏览器 keys + 317B basearr 重现 cookie，curl 重放测试
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const PROXY = 'http://74940609:aFmWc5Fs@119.167.233.189:2018';
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const numarr2string = require('@src/handler/parser/common/numarr2string');

  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  const B86_64 = NX_BS.slice(0, 64);

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  const oCookie = sync.cookies.find(c => c.name.endsWith('O'));
  const pCookieName = sync.cookies.find(c => c.name.endsWith('P')).name;
  const bCookie = sync.cookies.find(c => c.name.endsWith('P')).value;
  const ba = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_browser_plain.json'))).basearr;
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, 'browser_nextarr_' + sync.challenge.nsd + '.json')));
  const head = nd.nextarr.slice(0, 11);

  // 重现 cookie（浏览器 keys + 317B basearr，random 任意）
  const E = numarrEncrypt([...ba]);
  const X = E.slice();
  for (let i = 0; i < 16 && i < X.length; i++) X[i] ^= bk.keys2[i];
  const arr17 = numarrAddTime([...bk.keys17], 0, 1 / 256)[0];
  const baseEnc = encryptMode1([...X], arr17, 0);
  const flag = 128 | (baseEnc.length >> 8);
  const N = baseEnc.length & 255;
  const nx = [...head, 48, ...bk.keys2, flag, N, ...baseEnc];
  const u4 = parser.numToNumarr4(parser.uuid(nx));
  const arr16 = numarrAddTime([...bk.keys16], 0, 1 / 256)[0];
  const encOut = encryptMode1([...u4, ...nx], arr16, 1, 0.5);
  const cookie = 'a' + numarr2string([...encOut], B86_64.split(''));
  console.log('重现 cookie 前 22:', cookie.substring(0, 22), 'len:', cookie.length);

  // curl 重放
  function curlReplay(cookieStr) {
    try {
      const cmd = `curl -x ${PROXY} -k -sS -o /dev/null -w "%{http_code}" --connect-timeout 15 --max-time 25 -A "${UA}" -H "Cookie: ${cookieStr}" "${TARGET}"`;
      return execSync(cmd, { encoding: 'utf8' }).trim();
    } catch (e) { return 'ERR:' + e.message.substring(0, 50); }
  }
  console.log('\n无 cookie:', curlReplay(''));
  console.log('浏览器原 cookie:', curlReplay(oCookie.name + '=' + oCookie.value + '; ' + pCookieName + '=' + bCookie));
  console.log('重现 cookie:', curlReplay(oCookie.name + '=' + oCookie.value + '; ' + pCookieName + '=' + cookie));
  // 也试仅 P cookie
  console.log('重现仅 P:', curlReplay(pCookieName + '=' + cookie));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
