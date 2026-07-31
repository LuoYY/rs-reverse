/**
 * 26_test_basearr_replay.js
 *
 * 用浏览器还原的 basearr（303B）作为管线 basearr，生成 cookie 重放测试
 * 验证：303B 是否就是 nx 的 basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
function encodeStr(bytes) {
  let out = '';
  let i = 0;
  while (i + 3 <= bytes.length) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += BASESTR[b0 >> 2] + BASESTR[((b0 & 3) << 4) | (b1 >> 4)] + BASESTR[((b1 & 15) << 2) | (b2 >> 6)] + BASESTR[b2 & 63];
    i += 3;
  }
  if (i + 2 === bytes.length) {
    const b0 = bytes[i], b1 = bytes[i + 1];
    out += BASESTR[b0 >> 2] + BASESTR[((b0 & 3) << 4) | (b1 >> 4)] + BASESTR[(b1 & 15) << 2];
  } else if (i + 1 === bytes.length) {
    const b0 = bytes[i];
    out += BASESTR[b0 >> 2] + BASESTR[(b0 & 3) << 4];
  }
  return out;
}

async function main() {
  // 读 303B basearr
  const d = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_decoded.json')));
  const basearr303 = d.basearr;
  const browserKeys2 = d.keys2;
  console.log('basearr 303B:', basearr303.length, '头部:', basearr303.slice(0, 8).join(','));

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const nsd = d.challenge.nsd, cd = d.challenge.cd;
  const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));

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
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { $_ts: fullTs, codemap } = coder.run();
  fullTs.cp[3] = r.cp3;
  gv.config.codemap = codemap;

  // 强制管线使用 303B basearr：直接构造 basearr，手动走加密链路
  const Cookie = require('@src/handler/Cookie');
  const parser = require('@src/handler/parser');
  // 手动：basearr303 → numenc → xor keys2 → encryptMode1 → nextarr → 外层
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarr2string = require('@src/handler/parser/common/numarr2string');
  const tools = require('@src/handler/parser/common/tools');
  const { uuid: uuidFn } = require('@src/handler/parser/common/uuid');

  // 先用管线正常生成 keys + cookie（确保 keys 状态正确）
  const pipeCookie = new Cookie(coder).run();
  const pipeName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
  const keys16 = gv.keys[16], keys17 = gv.keys[17], keys2 = gv.keys[2];
  console.log('\n管线正常 cookie:', pipeName, 'len=' + pipeCookie.length);

  // 对比管线 keys2 与浏览器 keys2
  console.log('管线 keys2 前8:', keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器keys2 前8:', browserKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2 匹配:', keys2.every((b, i) => b === browserKeys2[i]) ? 'YES ✓' : 'NO ✗');

  // 手动构造：用 303B basearr
  console.log('\n=== 手动构造 cookie（303B basearr）===');
  const numenc = numarrEncrypt([...basearr303]);
  console.log('numenc:', numenc.length, 'B');
  const xorRed = tools.xor([...numenc], [...keys2], 16);
  console.log('xor后:', xorRed.length);
  const key17t = numarrAddTime([...keys17], Math.floor(Date.now() / 1000), Math.random())[0];
  const innerEnc = encryptMode1([...xorRed], key17t, 0);
  console.log('内层加密:', innerEnc.length, 'B');

  // nextarr：结构与浏览器一致 [04][08 6a6cb0bf 6a6cb0bd][30][keys2 48B][encLen][innerEnc]
  const t = Math.floor(Date.now() / 1000);
  const tArr = [(t >>> 24) & 255, (t >>> 16) & 255, (t >>> 8) & 255, t & 255];
  const nextarr = [4, 8, ...tArr, ...tArr, 189, 48, ...keys2, innerEnc.length, ...innerEnc];
  console.log('nextarr len:', nextarr.length);

  const uuid4 = [183, 202, 150, 131];  // 随机 uuid（占位）
  const outerInput = [...uuid4, ...nextarr];
  const key16t = numarrAddTime([...keys16], Math.floor(Date.now() / 1000), Math.random())[0];
  const outerEnc = encryptMode1([...outerInput], key16t, 1);
  console.log('外层加密:', outerEnc.length, 'B');

  const cookie = 'a' + encodeStr(outerEnc);
  console.log('cookie len:', cookie.length);

  // 重放
  const https = require('https');
  function httpGet(url, cookieH) {
    return new Promise((resolve) => {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0', 'Cookie': cookieH },
      }, res => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
      req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
      req.end();
    });
  }
  // 需要 O cookie
  const oCookie = d.cookies ? null : null;
  const resp = await httpGet(TARGET, `${pipeName}=${cookie}`);
  console.log('\n重放 / →', resp.status);
  console.log('响应前 150:', resp.body.substring(0, 150));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
