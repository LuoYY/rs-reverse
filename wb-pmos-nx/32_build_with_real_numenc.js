/**
 * 32_build_with_real_numenc.js
 *
 * 用浏览器真实 numenc（从 [185] 输入还原）构造完整 cookie
 * 验证：除 basearr 还原外，其他环节（keys2/nextarr/外层）是否正确
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
  const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
  const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
  const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
  const enc185 = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288 && e.res && e.res.len === 304);
  const realInput = enc185.args[0].d;
  const browserNumenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);
  console.log('浏览器 numenc len:', browserNumenc.length);

  // 管线初始化
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
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

  const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const tools = require('@src/handler/parser/common/tools');
  const keys16 = gv.keys[16], keys17 = gv.keys[17];

  // 用浏览器 numenc 构造（numenc 已是 basearr 的 huffman 编码）
  // 注意：XOR 是加密的一部分：numenc → xor keys2 前16 → 加密输入
  const xorRed = tools.xor([...browserNumenc], [...keys2], 16);
  console.log('xor 后:', xorRed.length);
  const now = Math.floor(Date.now() / 1000);
  const key17t = numarrAddTime([...keys17], now, Math.random())[0];
  const innerEnc = encryptMode1([...xorRed], key17t, 0);
  console.log('innerEnc:', innerEnc.length);

  const t4 = [(now >>> 24) & 255, (now >>> 16) & 255, (now >>> 8) & 255, now & 255];
  const encLenBytes = innerEnc.length > 255 ? [0x80 | (innerEnc.length >> 8), innerEnc.length & 255] : [innerEnc.length];
  const nextarr = [4, 8, ...t4, ...t4, 48, ...keys2, ...encLenBytes, ...innerEnc];
  const uuid4 = [183, 202, 150, 131];
  const outerInput = [...uuid4, ...nextarr];
  const key16t = numarrAddTime([...keys16], now, Math.random())[0];
  const outerEnc = encryptMode1([...outerInput], key16t, 1);
  const cookie = 'a' + encodeStr(outerEnc);
  console.log('cookie len:', cookie.length);

  // 重放（带浏览器 O）
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
  const oC = inner.cookies.find(c => c.name.endsWith('O'));
  const pName = inner.cookies.find(c => c.name.endsWith('P')).name;
  const resp = await httpGet('https://pmos.nx.sgcc.com.cn:10443/', `${oC.name}=${oC.value}; ${pName}=${cookie}`);
  console.log('\n重放 →', resp.status);
  if (resp.status === 200) console.log('★★★ 真实 numenc 构造成功！');
  else console.log('响应前 150:', resp.body.substring(0, 150));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
