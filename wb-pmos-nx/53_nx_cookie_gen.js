/**
 * 53_nx_cookie_gen.js
 *
 * nx 专用 cookie 生成：
 *   1. makeCookie 流程获取管线 keys（成功 cd）
 *   2. 手动构造 nx nextarr 结构（[4][8][t4][t4][48][keys2][encLen][innerEnc]）
 *   3. 外层加密 → cookie
 *   4. 立即重放
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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

function httpGet(url, cookieH) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: u.port, path: u.pathname, method: 'GET', rejectUnauthorized: false,
      headers: { 'User-Agent': UA, 'Accept': '*/*', ...(cookieH ? { Cookie: cookieH } : {}) },
    }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    req.on('error', e => resolve({ status: 'ERR', error: e.message, body: '', headers: {} }));
    req.end();
  });
}

async function main() {
  // 读取 basearr303（浏览器还原）
  let basearr303;
  const exactFile = path.join(__dirname, 'captures', 'basearr_exact.json');
  if (fs.existsSync(exactFile)) {
    basearr303 = JSON.parse(fs.readFileSync(exactFile)).basearr;
  } else {
    basearr303 = JSON.parse(fs.readFileSync(path.join(__dirname, 'captures', 'basearr_decoded.json'))).basearr;
  }
  console.log('basearr303 len:', basearr303.length);

  for (let attempt = 1; attempt <= 8; attempt++) {
    console.log(`\n===== 尝试 ${attempt} =====`);
    try {
      const ch = await httpGet(TARGET);
      const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (!m) continue;
      const nsd = +m[1], cd = m[2];
      const oCookie = [].concat(ch.headers['set-cookie'] || []).map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
      const [oName, oVal] = oCookie.split('=');

      for (const k of Object.keys(require.cache)) delete require.cache[k];
      require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
      const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
      const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
      const r = runOuterVM({ nsd, cd }, fs.readFileSync(OUTER_JS, 'utf8'));
      if (!r.cp3) continue;

      const gv = require('@src/handler/globalVarible');
      const { getCode } = require('@utils/');
      const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 1151, cp3Override: r.cp3 };
      fs.writeFileSync('/tmp/nx-ts.json', JSON.stringify(ts));
      const argv = { file: '/tmp/nx-ts.json', jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(ROOT, 'output'), level: 'error', _: ['makecookie'] };
      const codeRet = await getCode(argv.jsurls);
      argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
      gv._setAttr('argv', argv);
      require('@src/config/')(gv);
      gv._setAttr('_ts', ts);

      // makeCookie 生成 keys
      const makeCookie = require('@src/makeCookie');
      const pipeCookie = makeCookie(ts, () => path.join(ROOT, 'output'));
      console.log('管线 cookie len:', pipeCookie.length);

      // 管线 keys
      const keys16 = gv.keys[16], keys17 = gv.keys[17], keys2 = gv.keys[2];
      console.log('keys16:', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('keys2 前8:', keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

      // 手动构造 nx cookie
      const parser = require('@src/handler/parser');
      const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
      const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
      const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
      const tools = require('@src/handler/parser/common/tools');

      gv.config.adapt.getKey = 0x68;
      const numenc = numarrEncrypt([...basearr303]);
      const xorRed = tools.xor([...numenc], [...keys2], 16);
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
      const pName = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + 'P';
      console.log('构造 cookie len:', cookie.length, '(', pName, ')');

      const resp = await httpGet(TARGET, `${oName}=${oVal}; ${pName}=${cookie}`);
      console.log('重放 →', resp.status);
      if (resp.status === 200) {
        console.log('★★★ nx 纯算法 cookie 有效！');
        return;
      }
    } catch (e) {
      console.log('失败:', e.message.substring(0, 80));
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('\n全部失败');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
