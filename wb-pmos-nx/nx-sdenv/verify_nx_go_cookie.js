// 用 Go 的 keys + 317B basearr 样本生成 cookie 并 replay（验证 Go 链路可行性）
// 复用 sdenv 的 cookie 生成对比 + Node 管线反解
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const getImmucfg = require('@utils/getImmucfg');
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function httpGetProxy(url, cookieH) {
  return new Promise((resolve) => {
    const http = require('http'), tls = require('tls');
    const p = new URL('http://ericshi:583315@120.220.64.185:2018');
    const auth = 'Basic ' + Buffer.from(p.username + ':' + p.password).toString('base64');
    const u = new URL(url);
    const cr = http.request({ host: p.hostname, port: +p.port, method: 'CONNECT', path: `${u.hostname}:${u.port || 443}`, headers: { 'Proxy-Authorization': auth, Host: `${u.hostname}:${u.port || 443}` }, timeout: 20000 });
    cr.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const ts = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        ts.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\n${cookieH ? `Cookie: ${cookieH}\r\n` : ''}Connection: close\r\n\r\n`);
      });
      let body = '';
      ts.on('data', d => body += d);
      ts.on('end', () => {
        const status = parseInt(body.match(/HTTP\/1\.1 (\d+)/)[1]);
        resolve({ status, body });
      });
    });
    cr.on('error', () => resolve({ status: 'ERR' }));
    cr.end();
  });
}

(async () => {
  // 1. 获取 nsd/cd/O cookie
  const ch = await httpGetProxy(B + '/');
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  const nsd = +m[1], cd = m[2];
  const setCookies = [].concat(ch.headers ? [] : []);
  // 从 412 body 无法直接拿 set-cookie（用代理原生）
  console.log('nsd:', nsd, 'cdLen:', cd.length);

  // 2. 用 sdenv 生成参考 cookie（200 验证）
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now();
    let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c); }
      lastLen = pLen;
      if (Date.now() - t0 > 40000) { clearInterval(iv); resolve(c); }
    }, 800);
  });
  const oCookie = cookies.split(';')[0].trim();
  const refP = cookies.split(';')[1].trim();
  dom.window.close();
  console.log('sdenv O:', oCookie.substring(0, 20), 'P len:', refP.length);

  // 3. Node 管线生成 Go-equivalent cookie（用 deriveOffset + Cookie.js）
  const gv = require('@src/handler/globalVarible');
  gv._setAttr('config', { keynameNum: 1151, adapt: { lastWord: 'P' } });
  const immucfg = getImmucfg(fs.readFileSync(OUTER_JS, 'utf8'));
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ nsd, cd, keynameNum: 1151, hasCodemap: true, hasDebug: false }, immucfg);
  const ret = coder.run();
  gv.config.codemap = ret.codemap;
  // deriveOffset
  const decrypt = require('@src/handler/parser/common/decrypt');
  const cdArr = decrypt(cd);
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
  function genKeysSim(ans, step) {
    const keys = [];
    let op = 1, gap;
    try {
      for (let i = 0; i < ans[0]; i++) {
        if (step === 2) { if (op + 1 >= ans.length) return null; gap = (ans[op] << 8) | ans[op + 1]; op += 2; }
        else { [gap, op] = getLensGo(ans, op); }
        if (gap < 0 || op + gap > ans.length) return null;
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
    } catch (e) { return null; }
    return keys;
  }
  let offset = null;
  for (let k0 = 0; k0 <= 127 && !offset; k0++) {
    for (let k1 = 0; k1 <= 127 && !offset; k1++) {
      const off = [tail[0]^51, tail[1]^2, tail[2]^k0, tail[3]^k1, tail[4]^2, tail[5]^k0, tail[6]^k1, tail[7]^48];
      const ans = tail.map((b, i) => b ^ off[i % 8]);
      if (ans[0] === 51 && ans[1] === 2 && ans[4] === 2 && ans[7] === 48) {
        const keys = genKeysSim(ans, 1);
        if (keys && keys.length > 32 && keys[2] && keys[2].length === 48 && [29,30,31,32].every(k => keys[k] && keys[k].length === 4)) {
          offset = off; break;
        }
      }
    }
  }
  console.log('offset:', offset ? offset.join(',') : 'FAIL');
  gv._setAttr('dynamicTaskOffset', offset);
  const tscd = require('@src/handler/parser/tscd');
  tscd.init();
  console.log('gv.keys[2] 含 >255:', gv.keys[2].filter(v => v > 255));
  console.log('gv.keys[16] 含 >255:', gv.keys[16].filter(v => v > 255));

  // 4. 用管线生成 cookie（用 317B basearr 样本）
  const Cookie = require('@src/handler/Cookie');
  const mk = new Cookie(coder);
  // 注入 317B basearr
  const sample = [176,35,250,1,166,209,172,217,115,19,125,245,137,0,14,16,0,0,157,90];
  // 完整 sample 太长，用 sdenv 的 basearr（164B）
  const sdenvBasearr = JSON.parse(fs.readFileSync('/tmp/nx_basearr_full3.json', 'utf8')).basearr;
  gv._setAttr('makecookieRuntimeConfig', { ...mk.config, basearrOverride: sdenvBasearr });
  // 手动构造 cookie（模拟 Go 的 generateCookie）
  const parser2 = require('@src/handler/parser');
  const { encryptMode1, encryptMode2, numarrAddTime, numarrEncrypt, numarr2string, numarrJoin, numToNumarr4, uuid, xor } = parser2;
  const basearr = sdenvBasearr;
  const numenc = numarrEncrypt(basearr);
  const xorResult = xor(numenc, gv.keys[2], 16);
  const k17t = numarrAddTime(gv.keys[17], mk.config.runTime, mk.config.random)[0];
  const basearrEnc = encryptMode1(xorResult, k17t, 0);
  const r2mkaTimeBytes = numToNumarr4(mk.config.r2mkaTime);
  const startTimeBytes = numToNumarr4(mk.config.startTime);
  const inner = numarrJoin(2, [...r2mkaTimeBytes, ...startTimeBytes], gv.keys[2]);
  const highByte = (basearrEnc.length >> 8 & 255) | 128;
  const nextarr = numarrJoin(inner, highByte, basearrEnc);
  const uuidBytes = numToNumarr4(uuid(nextarr));
  const k16t = numarrAddTime(gv.keys[16], mk.config.runTime, mk.config.random)[0];
  const enc16 = encryptMode1([...uuidBytes, ...nextarr], k16t, 1, mk.config.random);
  const cookieStr = 'a' + numarr2string(enc16, gv.config.adapt.basestr);
  console.log('Go-style cookie len:', cookieStr.length);

  // 5. replay
  const resp = await httpGetProxy(B + '/', `${oCookie}; ${cookieStr}`);
  console.log('replay →', resp.status, resp.status === 200 ? '★★★ 成功!' : '');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
