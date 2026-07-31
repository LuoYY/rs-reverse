/**
 * 27_exact_build_cookie.js
 *
 * 用浏览器真实数据（keys2/keys16/keys17/basearr303）精确构造 cookie：
 *   1. 解析浏览器外层输入（nextarr 结构）
 *   2. 手动构造：basearr303 → numenc → xor(keys2,16) → encryptMode1(keys17) → nextarr → 外层
 *   3. 重放测试
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
    out += BASESTR[bytes[i] >> 2] + BASESTR[(bytes[i] & 3) << 4];
  }
  return out;
}

async function main() {
  // 读取数据
  const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
  const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
  const dec = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_decoded.json')));

  // 浏览器 keys
  const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
  const keys16 = inner.log.find(e => e.idx === 598 && e.args[0] && e.args[0].len === 16).args[0].d;
  // keys17：598 调用中 args[0] 不等于 keys16 的那个 16 数组
  const key17Cand = inner.log.filter(e => e.idx === 598 && e.args[0] && e.args[0].len === 16)
    .map(e => e.args[0].d)
    .find(d => !d.every((b, i) => b === keys16[i]));
  if (!key17Cand) { console.log('keys17 未找到'); process.exit(1); }
  const keys17 = key17Cand;
  console.log('keys16:', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17:', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2 :', keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 浏览器外层输入（nextarr 结构）
  const outerIn = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len > 300).args[0].d;
  console.log('\n浏览器外层输入 len:', outerIn.length);
  console.log('uuid4:', outerIn.slice(0, 4).map(b => b.toString(16)).join(''));
  const na = outerIn.slice(4);
  console.log('nextarr 前 16:', na.slice(0, 16).join(','));
  console.log('nextarr[0..1]:', na[0], na[1], '(期望 4, 8)');
  console.log('nextarr[2..9]:', na.slice(2, 10).map(b => b.toString(16)).join(' '), '(t4 x2)');
  console.log('nextarr[10]:', na[10], '(keys2len)');
  console.log('keys2 位置校验:', na.slice(11, 15).every((b, i) => b === keys2[i]) ? '✓' : '✗');
  // basearrEncLen 前缀
  let pos = 11 + 48;
  const lenByte = na[pos];
  let encLen, encLenBytes = 1;
  if (lenByte & 128) { encLen = ((lenByte & 127) << 8) | na[pos + 1]; encLenBytes = 2; }
  else encLen = lenByte;
  console.log('basearrEncLen 前缀:', lenByte.toString(16), 'encLen:', encLen, 'encLenBytes:', encLenBytes);
  const innerEncReal = na.slice(pos + encLenBytes, pos + encLenBytes + encLen);
  console.log('innerEnc 长度:', innerEncReal.length, '匹配304:', innerEncReal.length === 304);
  console.log('nextarr 总长:', na.length, '(期望', pos + encLenBytes + encLen, ')');

  // === 手动构造 ===
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  // 初始化管线（Coder 提供 gv.config 供 encryptMode1 使用）
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const r = runOuterVM({ nsd: inner.challenge.nsd, cd: inner.challenge.cd }, fs.readFileSync(OUTER_JS, 'utf8'));
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const ts = { nsd: inner.challenge.nsd, cd: inner.challenge.cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
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
  const Cookie = require('@src/handler/Cookie');
  new Cookie(coder).run();

  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const tools = require('@src/handler/parser/common/tools');

  const basearr303 = dec.basearr;
  const numenc = numarrEncrypt([...basearr303]);
  const xorRed = tools.xor([...numenc], [...keys2], 16);
  const now = Math.floor(Date.now() / 1000);
  const key17t = numarrAddTime([...keys17], now, Math.random())[0];
  const innerEnc = encryptMode1([...xorRed], key17t, 0);
  console.log('\nnumenc:', numenc.length, 'xor:', xorRed.length, 'innerEnc:', innerEnc.length);

  // nextarr 精确结构
  const t4 = [(now >>> 24) & 255, (now >>> 16) & 255, (now >>> 8) & 255, now & 255];
  const encLenBytes2 = innerEnc.length > 255 ? [0x80 | (innerEnc.length >> 8), innerEnc.length & 255] : [innerEnc.length];
  const nextarr = [4, 8, ...t4, ...t4, 48, ...keys2, ...encLenBytes2, ...innerEnc];
  console.log('nextarr len:', nextarr.length, '(浏览器', na.length, ')');

  // 外层加密
  const uuid4 = outerIn.slice(0, 4);
  const outerInput = [...uuid4, ...nextarr];
  const key16t = numarrAddTime([...keys16], now, Math.random())[0];
  const outerEnc = encryptMode1([...outerInput], key16t, 1);
  console.log('外层加密:', outerEnc.length, 'B');

  const cookie = 'a' + encodeStr(outerEnc);
  console.log('cookie len:', cookie.length, '(真实', inner.cookies.find(c => c.name.endsWith('P')).value.length, ')');

  // 重放
  const https = require('https');
  function httpGet(url, cookieH) {
    return new Promise((resolve) => {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0', 'Cookie': cookieH },
      }, res => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
      });
      req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '' }));
      req.end();
    });
  }
  const pName = inner.cookies.find(c => c.name.endsWith('P')).name;
  const oName = inner.cookies.find(c => c.name.endsWith('O')).name;
  const oVal = inner.cookies.find(c => c.name.endsWith('O')).value;
  const resp = await httpGet('https://pmos.nx.sgcc.com.cn:10443/', `${oName}=${oVal}; ${pName}=${cookie}`);
  console.log('\n重放 / →', resp.status, '(O+P 配对)');
  if (resp.status === 200) console.log('★★★ COOKIE 有效！');
  else console.log('响应前 200:', resp.body.substring(0, 200));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
