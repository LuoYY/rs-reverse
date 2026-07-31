/**
 * 09_reverse_real_cookie.js
 *
 * 反解浏览器真实 P cookie（471 字符）→ nextarr → basearr 明文
 *
 * 原理（瑞数 P cookie 结构）：
 *   cookie = '0' + numarr2string(encryptMode1([uuid4, ...nextarr], numarrAddTime(keys16), flag=1))
 *   nextarr = [2, time4, startTime4, keys2len, ...keys2, basearrEncLen, ...basearrEncrypt]
 *   basearrEncrypt = encryptMode1(numarrEncrypt(basearr) xor keys2, numarrAddTime(keys17), flag=0)
 *
 * 步骤：
 *   1. 用浏览器捕获的真实 cookie 字符串
 *   2. 用管线 keys16 + 遍历 time/ele → encryptMode2 → nextarr（uuidOk 判据）
 *   3. 解析 nextarr 得到 basearrEncrypt + 浏览器 keys2（自校验）
 *   4. 用管线 keys17 + 遍历 time/ele → decrypt basearrEncrypt → numenc → xor keys2 → basearr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

// 从浏览器捕获数据读取真实 cookie
const capFile = fs.readdirSync(OUT).filter(f => f.startsWith('enc_')).sort().pop();
const cap = JSON.parse(fs.readFileSync(path.join(OUT, capFile)));
const pCookie = cap.cookies.find(c => c.name.endsWith('P')).value;
console.log('真实 P cookie len:', pCookie.length);

const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeCookie(cookie) {
  const payload = cookie.startsWith('0') ? cookie.slice(1) : cookie;
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 1 < payload.length) {
    bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
  }
  return bytes;
}

async function main() {
  // 1. 解码 cookie 为字节
  const encBytes = decodeCookie(pCookie);
  console.log('解码后 encBytes len:', encBytes.length);

  // 2. 加载管线（拉挑战后加载，避免模块状态污染）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const https = require('https');
  function httpGet(url) {
    return new Promise((resolve) => {
      const u = new URL(url);
      https.get({ hostname: u.hostname, port: u.port, path: u.pathname, rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
        let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
      }).on('error', e => resolve({ status: 'ERR', error: e.message }));
    });
  }
  console.log('\n[管线] 生成 keys（用捕获会话的 cd）...');
  // 必须用浏览器捕获时的同会话 nsd/cd，否则 keys 不匹配！
  const nsd = cap.challenge.nsd;
  const cd = cap.challenge.cd;
  console.log('  使用捕获会话 nsd=' + nsd + ' cdLen=' + cd.length);
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
  // 必须跑 Cookie 才会填充 keys
  const Cookie = require('@src/handler/Cookie');
  new Cookie(coder).run();
  const keys16 = gv.keys[16], keys17 = gv.keys[17], keys2 = gv.keys[2];
  console.log('keys16:', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17:', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2 :', keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 3. 反解外层：encryptMode2(encBytes, numarrAddTime(keys16, t, r), flag=1)
  // flag=1 带 IV，密文第一块是 IV（16B），所以有效密文 = encBytes.slice(16)
  console.log('\n[反解外层] 遍历 time/ele...');
  const now = Math.floor(Date.now() / 1000);
  let best = null;
  for (let t = now - 60; t <= now + 60; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...keys16], t, ele / 256)[0];
        const dec = encryptMode2([...encBytes], arr, 1);
        // uuidOk 判据：dec = [uuid4][nextarr]，nextarr 头 [2][t4][start4][keys2len=48]
        if (dec.length > 100 && dec[4] === 2 && dec[13] === 48) {
          console.log('  ★ 命中! t=' + t + ' ele=' + ele + ' decLen=' + dec.length);
          best = { t, ele, dec };
          break;
        }
      } catch (e) {}
    }
    if (best) break;
  }
  if (!best) { console.log('  未命中，尝试其他判据'); process.exit(1); }

  // 4. 解析 nextarr（dec = [uuid4][nextarr]，nextarr = [2][t4][start4][keys2len][keys2...]）
  const nextarr = best.dec;
  console.log('\n[解析 nextarr] len=' + nextarr.length);
  console.log('  头20:', nextarr.slice(0, 20).join(','));
  let pos = 4;   // 跳过 uuid4
  if (nextarr[pos] !== 2) { console.log('  nextarr 头不是 2:', nextarr[pos]); process.exit(1); }
  pos += 1;
  const t4 = nextarr.slice(pos, pos + 4); pos += 4;
  const start4 = nextarr.slice(pos, pos + 4); pos += 4;
  const keys2len = nextarr[pos++];
  const realKeys2 = nextarr.slice(pos, pos + keys2len); pos += keys2len;
  let encLen;
  const lenByte = nextarr[pos];
  if (lenByte > 255) { /* 不可能，lenByte 是 byte */ }
  encLen = nextarr[pos] & 127;
  const lenHi = nextarr[pos] & 128 ? nextarr[pos + 1] : null;
  if (lenHi !== null) { encLen = ((nextarr[pos] & 127) << 8) | nextarr[pos + 1]; pos += 2; }
  else pos += 1;
  const basearrEncrypt = nextarr.slice(pos, pos + encLen);
  console.log('  t4:', t4.map(b => b.toString(16)).join(' '), 'start4:', start4.map(b => b.toString(16)).join(' '));
  console.log('  keys2len:', keys2len, 'realKeys2 前8:', realKeys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  管线keys2 前8:', keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  keys2 匹配:', realKeys2.every((b, i) => b === keys2[i]) ? 'YES' : 'NO');
  console.log('  basearrEncrypt len:', encLen);

  // 5. 反解内层：basearrEncrypt = encryptMode1(xor(numarrEncrypt(basearr), keys2), numarrAddTime(keys17), flag=0)
  console.log('\n[反解内层] 遍历 time/ele...');
  let basearr = null;
  for (let t2 = now - 60; t2 <= now + 60; t2++) {
    for (let ele2 = 1; ele2 <= 256; ele2++) {
      try {
        const arr2 = numarrAddTime([...keys17], t2, ele2 / 256)[0];
        const dec2 = encryptMode2([...basearrEncrypt], arr2, 0);
        // 异或回 keys2 → numenc，再 numarrEncrypt 逆？
        // numarrEncrypt 是 huffman 编码，不可逆。但我们只需要判断：dec2 xor keys2 的开头特征
        // basearr 明文特征：头 3,73 或 3,xx（numarrJoin 外层）
        const plain = dec2.map((b, i) => b ^ keys2[i % keys2.length]);
        if (plain[0] === 3) {
          console.log('  ★ 命中! t=' + t2 + ' ele=' + ele2 + ' basearr[0..8]=' + plain.slice(0, 8).join(','));
          basearr = plain;
          break;
        }
      } catch (e) {}
    }
    if (basearr) break;
  }
  if (!basearr) {
    console.log('  内层未按 3,73 命中。尝试直接输出所有 dec2[0:8]=3 的结果');
    for (let t2 = now - 60; t2 <= now + 60; t2++) {
      for (let ele2 = 1; ele2 <= 256; ele2++) {
        try {
          const arr2 = numarrAddTime([...keys17], t2, ele2 / 256)[0];
          const dec2 = encryptMode2([...basearrEncrypt], arr2, 0);
          const plain = dec2.map((b, i) => b ^ keys2[i % keys2.length]);
          if (plain[0] === 3) console.log('  t=' + t2 + ' ele=' + ele2 + ' dec2len=' + dec2.length + ' plain[0:12]=' + plain.slice(0, 12).join(','));
        } catch (e) {}
      }
    }
    process.exit(1);
  }

  console.log('\n=== 真实 basearr 明文 ===');
  console.log('len:', basearr.length);
  console.log('hex:', basearr.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 保存
  fs.writeFileSync(path.join(OUT, 'real_basearr.json'), JSON.stringify({
    capturedAt: Date.now(), pCookie, nextarr, basearr,
    keys16: keys16.map(b => b.toString(16).padStart(2, '0')).join(' '),
    keys17: keys17.map(b => b.toString(16).padStart(2, '0')).join(' '),
    keys2: keys2.map(b => b.toString(16).padStart(2, '0')).join(' '),
  }, null, 2));
  console.log('已保存 captures/real_basearr.json');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
