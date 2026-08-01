/**
 * 147_full_reproduce.js
 *
 * 完整重现 Cookie.run()（保存的 keys + basearr + runTime）→ 生成 cookie → 反解 → 对比
 * 定位 412：Cookie.run() 生成问题 vs basearr 内容问题
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const payload = s.startsWith('0') ? s.slice(1) : s;
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return bytes;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const parser = require('@src/handler/parser');
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const { xor } = require('@src/handler/parser/common/');
  const { numToNumarr4, uuid, numarrJoin, numarr2string } = parser;

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const keys = s.keys, keys2 = s.keys2, keys16 = s.keys16, keys17 = s.keys17, basearr = s.basearr;
  const runTime = s.runTime;
  const savedCookie = s.cookie.split('=')[1];
  console.log('nsd:', s.nsd, 'runTime:', runTime, 'basearr:', basearr.length, 'saved cookie:', savedCookie.length);

  // r2mkaTime
  let r2mkaTime = 0;
  if (keys[21]) r2mkaTime = parseInt(keys[21].map(c => String.fromCharCode(c)).join(''), 10);
  const startTime = runTime - 1;

  // 完整 Cookie.run() 重现
  const random = 0.42;
  const basearrEncrypt = encryptMode1(
    xor(numarrEncrypt(basearr), keys2, 16),
    numarrAddTime(keys17, runTime, random)[0],
    0
  );
  const nextarr = numarrJoin(
    numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys2),
    undefined,
    basearrEncrypt,
  );
  const myCookie = '0' + numarr2string(
    encryptMode1(
      [...numToNumarr4(uuid(nextarr)), ...nextarr],
      numarrAddTime(keys16, runTime, random)[0],
      1,
      random
    ),
    BASESTR.split('')
  );
  console.log('重现 cookie len:', myCookie.length);
  console.log('与保存相同:', myCookie === savedCookie ? 'YES' : 'NO');
  if (myCookie !== savedCookie) {
    let d = -1;
    for (let i = 0; i < Math.min(myCookie.length, savedCookie.length); i++) if (myCookie[i] !== savedCookie[i]) { d = i; break; }
    console.log('首个不同 @', d);
  }

  // 反解重现的 cookie（同 random → 同 key）
  const myBytes = decodeStr(myCookie);
  const key = numarrAddTime([...keys16], runTime, random)[0];
  const dec = encryptMode2([...myBytes], key, 1);
  const plain = [...numToNumarr4(uuid(nextarr)), ...nextarr];
  const same = dec.length === plain.length && dec.every((v, i) => v === plain[i]);
  console.log('重现 cookie 反解一致:', same ? '★★★ YES（Cookie.run() 逻辑自洽）' : 'NO');

  // 反解保存的 cookie（同 key）
  const sBytes = decodeStr(savedCookie);
  let sDec = null;
  try { sDec = encryptMode2([...sBytes], key, 1); } catch (e) { console.log('保存 cookie 反解错误:', e.message.substring(0, 40)); }
  if (sDec) {
    const calc = parser.numToNumarr4(parser.uuid(sDec.slice(4)));
    console.log('保存 cookie 反解 uuid 校验:', calc.every((b, i) => b === sDec[i]) ? 'YES' : 'NO');
    const na = sDec.slice(4);
    const rk2 = na.slice(11, 59);
    console.log('保存 cookie nextarr keys2:', rk2.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', keys2.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
