/**
 * 352_pure_pipeline_test.js
 * 纯算法端到端（无浏览器）：纯 HTTP 拉挑战 → runOuterVM(cp3) → 管线 Coder → makeCookie → query 测试
 * 验证：管线 gv.keys[2] 是否被服务器接受（nx keys2 纯算法可行？）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PROXY = 'http://74940609:aFmWc5Fs@39.91.164.125:2018';
const PROXY_URL = new URL(PROXY);
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];
const MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

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
function deriveOffset(tail) {
  try {
    const off0 = tail[0] ^ 51, off1 = tail[1] ^ 2, off4 = tail[4] ^ 2, off7 = tail[7] ^ 48;
    for (let k0 = 0; k0 <= 127; k0++) {
      const off2 = tail[2] ^ k0, off5 = tail[5] ^ k0;
      for (let k1 = 0; k1 <= 127; k1++) {
        const off3 = tail[3] ^ k1, off6 = tail[6] ^ k1;
        const offset = [off0, off1, off2, off3, off4, off5, off6, off7];
        const ans = tail.map((b, i) => b ^ offset[i % 8]);
        if (ans[0] !== 51 || ans[1] !== 2 || ans[4] !== 2 || ans[7] !== 48) continue;
        const keys = [];
        let op = 1, gap, ok = true;
        for (let i = 0; i < ans[0]; i++) {
          [gap, op] = getLensGo(ans, op);
          if (gap < 0 || op + gap > ans.length) { ok = false; break; }
          keys.push(ans.slice(op, op + gap));
          op += gap;
        }
        if (!ok) continue;
        if (keys[16] && keys[16].length === 16 && keys[16].every((v, i) => v === K16[i])) return { offset, keys };
      }
    }
  } catch (e) {}
  return null;
}
function httpsGetWithProxy(url, cookieH, method = 'GET', body = '') {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR', error: 'CONNECT ' + res.statusCode }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        let req = `${method} ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n`;
        if (cookieH) req += `Cookie: ${cookieH}\r\n`;
        if (body) req += `Content-Type: application/json;charset=UTF-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n`;
        req += '\r\n' + body;
        tlsSock.write(req);
      });
      let data = '';
      tlsSock.on('data', d => data += d);
      tlsSock.on('end', () => {
        const headEnd = data.indexOf('\r\n\r\n');
        if (headEnd < 0) { resolve({ status: 'ERR', error: 'bad response' }); return; }
        const head = data.substring(0, headEnd);
        const status = parseInt((head.split(' ')[1] || '').trim());
        const setCookies = [];
        head.split('\r\n').forEach(l => { const m = l.match(/^set-cookie:\s*(.+)$/i); if (m) setCookies.push(m[1]); });
        resolve({ status, headers: { 'set-cookie': setCookies }, body: data.substring(headEnd + 4) });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR', error: e.message }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'ERR', error: 'TIMEOUT' }); });
    connectReq.end();
  });
}
function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}

(async () => {
  console.log('=== 纯算法端到端（无浏览器）===');
  const ch = await httpsGetWithProxy(TARGET);
  if (ch.status !== 412) { console.log('挑战页:', ch.status, ch.error || ch.body.substring(0, 100)); process.exit(1); }
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('无 $_ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
  console.log('nsd=' + nsd + ' cdLen=' + cd.length + ' O len=' + (oCookie.split('=')[1] || '').length);

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  if (!r.cp3) { console.log('cp3 提取失败'); process.exit(1); }
  console.log('cp3:', r.cp3, 'dynLen:', r.dynLen);

  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
  fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
  const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  gv._setAttr('_ts', ts);
  require('@src/handler/parser/constData').init();

  // offset 推导（K16 锚）
  function makeDecryptKeys(bs) {
    return bs.split('').reduce((ans, key, idx) => {
      const code = key.charCodeAt();
      ans[0][code] = idx << 2; ans[1][code] = idx >> 4;
      ans[2][code] = (idx & 15) << 4; ans[3][code] = idx >> 2;
      ans[4][code] = (idx & 3) << 6; ans[5][code] = idx;
      return ans;
    }, [{}, {}, {}, {}, {}, { ...new Array(255 + 1).fill(-1) }]);
  }
  const dk = makeDecryptKeys(NX_BS);
  const [d1, d2, d3, d4, d5, d6] = dk;
  const cdArr = [];
  for (let i = 0; i < cd.length; i += 4) {
    const one = cd[i].charCodeAt();
    const two = i + 1 < cd.length ? cd[i + 1].charCodeAt() : undefined;
    const three = i + 2 < cd.length ? cd[i + 2].charCodeAt() : undefined;
    const four = i + 3 < cd.length ? cd[i + 3].charCodeAt() : undefined;
    two !== undefined && cdArr.push(d1[one] | d2[two]);
    three !== undefined && cdArr.push(d3[two] | d4[three]);
    four !== undefined && cdArr.push(d5[three] | d6[four]);
  }
  const end = (cdArr[0] << 8 | cdArr[1]) + 2;
  const d = deriveOffset(cdArr.slice(end));
  if (d) {
    gv._setAttr('dynamicTaskOffset', d.offset);
    console.log('offset 推导 OK, numKeys:', d.keys.length);
  } else { console.log('offset 推导失败'); }

  // 跑 Coder → keys
  let coder = null;
  try {
    const Coder = require('@src/handler/Coder');
    coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
    coder.run();
  } catch (e) { console.log('Coder.run:', e.message.substring(0, 80)); }

  // makeCookie
  let cookie = null, pName = '';
  try {
    const makeCookie = require('@src/makeCookie');
    cookie = makeCookie(ts, () => path.join(ROOT, 'output'));
    pName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
    console.log('makeCookie OK, len:', cookie.length);
  } catch (e) { console.log('makeCookie 失败:', e.message.substring(0, 120)); }

  // 打印 keys
  const k2 = gv.keys && gv.keys[2];
  const k17 = gv.keys && gv.keys[17];
  console.log('gv.keys[2] len:', k2 && k2.length, '前8:', k2 && k2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('gv.keys[17] len:', k17 && k17.length);
  console.log('runTime:', gv.makecookieRuntimeConfig && gv.makecookieRuntimeConfig.runTime);

  // 生成 query（用管线 keys）
  if (k2 && k2.length === 48 && k17 && cookie) {
    const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    const numarr2string = require('@src/handler/parser/common/numarr2string');
    const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
    const randByte = () => Math.floor(Math.random() * 256);
    function genQuery(urlPath, timeVal) {
      const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
      const plain24 = [
        k2[0] ^ MASK[0], k2[1] ^ MASK[1], k2[2] ^ MASK[2], k2[3] ^ MASK[3],
        k2[4] ^ MASK[4], k2[5] ^ MASK[5], k2[6] ^ MASK[6], k2[7] ^ MASK[7],
        randByte(), randByte(), randByte(), randByte(), randByte(),
        randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
        (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
      ];
      const [key21] = numarrAddTime([...k17], timeVal, Math.random());
      const requestData = encryptMode1(plain24, key21, 0);
      const body = [4, 0, 48, ...k2, 32, ...requestData];
      const crc = crc32b(Buffer.from(body));
      return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64.split(''));
    }
    const API = '/px-gateway/GatewayConfig/getGatewayConfig';
    const rt = gv.makecookieRuntimeConfig.runTime;
    const urlQ = genQuery(API, rt);
    const hdrQ = genQuery(API, rt);
    const cookieStr = oCookie + '; ' + pName + '=' + cookie;
    const apiUrl = 'https://pmos.nx.sgcc.com.cn:10443' + API + '?' + urlQ;

    // curl 请求
    const cmd = `curl -s -o /tmp/352_api.html -w "%{http_code}" -x "${PROXY}" --max-time 20 -X POST '${apiUrl}' -H 'Content-Type: application/json;charset=UTF-8' -H 'ClientTag: OUTNET_BROWSE' -H 'CurrentRoute: /outNet' -H 'MurR7rxG: ${hdrQ}' -H 'User-Agent: ${UA}' -b '${cookieStr}' -d '{}'`;
    try {
      const code = execSync(cmd, { timeout: 30000 }).toString().trim();
      const body = fs.readFileSync('/tmp/352_api.html', 'utf8');
      console.log('\n纯算法 API:', code, body.substring(0, 80).replace(/\n/g, ' '));
    } catch (e) { console.log('curl err:', e.message.substring(0, 100)); }
  } else {
    console.log('\nkeys/cookie 不完整，无法生成 query');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
