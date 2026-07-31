/**
 * 18_reverse_cookie2.js
 *
 * 用正确解码（支持余数，query 验证过）反解浏览器 cookie：
 *   cookie = 'a' + numarr2string(encBytes)
 *   用管线 keys16 遍历 time/ele → encryptMode2 flag=1 → nextarr
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

// 与 query 相同的解码（验证过 88B 正确）
const XJ_BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
function decodeStr(s) {
  const idxmap = {};
  for (let i = 0; i < XJ_BASESTR.length; i++) idxmap[XJ_BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]];
    if (c0 === undefined) { console.log('非法字符@' + qi + '=' + s[qi]); break; }
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]];
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2));
  } else if (qi + 1 < s.length) {
    bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  }
  return bytes;
}

async function main() {
  // 找浏览器捕获（combined 或 query 文件的 cookie）
  const capFile = fs.readdirSync(OUT).filter(f => f.startsWith('combined_')).sort().pop();
  const cap = JSON.parse(fs.readFileSync(path.join(OUT, capFile)));
  const pCookie = cap.cookies.find(c => c.name.endsWith('P')).value;
  console.log('P cookie len:', pCookie.length, '前缀:', pCookie[0]);

  // 解码（去前缀）
  const encBytes = decodeStr(pCookie.slice(1));
  console.log('解码后:', encBytes.length, '字节');
  console.log('  应为 16 倍数:', encBytes.length % 16 === 0 ? 'YES' : 'NO');

  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';

  const nsd = cap.challenge.nsd, cd = cap.challenge.cd;
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
  const Cookie = require('@src/handler/Cookie');
  new Cookie(coder).run();
  const keys16 = gv.keys[16], keys17 = gv.keys[17], keys2 = gv.keys[2];
  console.log('\nkeys16:', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17:', keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 反解外层
  console.log('\n[反解外层] 遍历 time/ele...');
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 300; t <= now + 300; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...keys16], t, ele / 256)[0];
        const dec = encryptMode2([...encBytes], arr, 1);
        if (dec.length > 100 && dec[4] === 2 && dec[13] === 48) {
          console.log('★ 命中 t=' + t + ' ele=' + ele + ' decLen=' + dec.length);
          found = { t, ele, dec };
          break;
        }
      } catch (e) {}
    }
    if (found) break;
  }
  if (!found) {
    console.log('外层未命中。打印所有能解出 dec[4]===2 的结果（限制前5）:');
    let count = 0;
    for (let t = now - 300; t <= now + 300; t++) {
      for (let ele = 1; ele <= 256; ele++) {
        try {
          const arr = numarrAddTime([...keys16], t, ele / 256)[0];
          const dec = encryptMode2([...encBytes], arr, 1);
          if (dec.length > 100 && dec[4] === 2) {
            console.log('  t=' + t + ' ele=' + ele + ' decLen=' + dec.length + ' dec[0..16]=' + dec.slice(0, 16).join(','));
            if (++count > 5) break;
          }
        } catch (e) {}
      }
      if (count > 5) break;
    }
    process.exit(1);
  }

  // 解析 nextarr
  const dec = found.dec;
  console.log('\n=== nextarr（dec = uuid4 + nextarr）===');
  console.log('len:', dec.length);
  console.log('uuid4:', dec.slice(0, 4).map(b => b.toString(16)).join(''));
  let pos = 4;
  const nextType = dec[pos];
  console.log('nextarr[0]:', nextType);
  pos++;
  if (nextType === 2) {
    const t4 = dec.slice(pos, pos + 4); pos += 4;
    const start4 = dec.slice(pos, pos + 4); pos += 4;
    const k2len = dec[pos++];
    const realKeys2 = dec.slice(pos, pos + k2len); pos += k2len;
    console.log('t4:', t4.map(b => b.toString(16)).join(' '), 'start4:', start4.map(b => b.toString(16)).join(' '));
    console.log('keys2len:', k2len);
    console.log('浏览器 keys2:', realKeys2.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('管线   keys2:', keys2.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 匹配:', realKeys2.every((b, i) => b === keys2[i]) ? 'YES ✓' : 'NO ✗');
    // basearrEncLen
    let encLen = dec[pos];
    let encLenBytes = 1;
    if (encLen & 128) { encLen = ((dec[pos] & 127) << 8) | dec[pos + 1]; encLenBytes = 2; }
    pos += encLenBytes;
    const basearrEncrypt = dec.slice(pos, pos + encLen);
    console.log('basearrEncLen:', encLen, 'basearrEncrypt len:', basearrEncrypt.length);
  } else {
    console.log('nextarr 头不是 2:', nextType, '前 30:', dec.slice(0, 30).join(','));
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
