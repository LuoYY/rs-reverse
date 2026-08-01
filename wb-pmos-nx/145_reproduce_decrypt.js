/**
 * 145_reproduce_decrypt.js
 *
 * 手动重现 Cookie.run() 加密（保存的 keys/runTime）→ 反解
 * 验证 encryptMode1/2 对称性（对真实 nextarr 结构）
 * 定位 95 号 cookie 反解失败原因
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
  const { numToNumarr4, uuid, numarrJoin, numarr2string } = parser;

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const keys = s.keys, keys2 = s.keys2, keys16 = s.keys16;
  const runTime = s.runTime;
  console.log('nsd:', s.nsd, 'runTime:', runTime, 'keys16:', keys16.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 1. 用保存的 nextarr 结构手动重现（r2mkaTime 从 keys[21]）
  let r2mkaTime = 0;
  if (keys[21]) r2mkaTime = parseInt(keys[21].map(c => String.fromCharCode(c)).join(''), 10);
  const startTime = runTime - 1;
  const fakeBasearrEnc = Array.from({ length: 200 }, (_, i) => (i * 5 + 3) % 256);
  const nextarr = numarrJoin(
    numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys2),
    undefined,
    fakeBasearrEnc,
  );
  const plain = [...numToNumarr4(uuid(nextarr)), ...nextarr];
  const random = 0.42;
  const key = numarrAddTime([...keys16], runTime, random)[0];
  const enc = encryptMode1([...plain], key, 1, random);
  console.log('手动加密 len:', enc.length, '（plain len:', plain.length, '）');

  // 2. 反解（同 random）
  const dec = encryptMode2([...enc], key, 1);
  const same = dec.length === plain.length && dec.every((v, i) => v === plain[i]);
  console.log('反解一致:', same ? '★★★ YES' : 'NO');
  if (!same) {
    console.log('plain 前 8:', plain.slice(0, 8).join(','));
    console.log('dec 前 8:', dec.slice(0, 8).join(','));
  }

  // 3. 用实际 cookie 反解（ele 遍历）
  const savedCookie = s.cookie.split('=')[1];
  const bytes = decodeStr(savedCookie);
  console.log('\n实际 cookie 解码:', bytes.length, 'B');
  let found = false;
  for (let ele = 1; ele <= 256 && !found; ele++) {
    try {
      const k2 = numarrAddTime([...keys16], runTime, ele / 256)[0];
      const d2 = encryptMode2([...bytes], k2, 1);
      if (d2.length > 20) {
        const calc = parser.numToNumarr4(parser.uuid(d2.slice(4)));
        if (calc.every((b, i) => b === d2[i])) { found = true; console.log('★ 实际 cookie 反解成功 ele=' + ele); }
      }
    } catch (e) { console.log('ele=' + ele, 'err:', e.message.substring(0, 40)); }
  }
  console.log('实际 cookie 反解:', found ? '成功' : '失败');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
