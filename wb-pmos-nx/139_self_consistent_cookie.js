/**
 * 139_self_consistent_cookie.js
 *
 * 手动生成 cookie（固定 random）→ 反解 → 验证自洽（encryptMode1/2 对称）
 * 若自洽 → 逻辑对 → 反解保存的 cookie 失败是 runTime/keys 保存值问题
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

  // 手动生成（固定 random）
  const random = 0.123456;
  const r2mkaTime = 1785578151;
  const startTime = runTime - 1;
  const fakeNextarr = numarrJoin(
    numarrJoin(2, numToNumarr4([r2mkaTime, startTime]), keys2),
    undefined,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // 假 basearr 加密段
  );
  const plain = [...numToNumarr4(uuid(fakeNextarr)), ...fakeNextarr];
  const key = numarrAddTime([...keys16], runTime, random)[0];
  const enc = encryptMode1([...plain], key, 1, random);
  console.log('手动加密 len:', enc.length);

  // 反解（用相同 random → 相同 key）
  const dec = encryptMode2([...enc], key, 1);
  const same = dec.length === plain.length && dec.every((v, i) => v === plain[i]);
  console.log('反解一致:', same ? '★★★ YES（encryptMode1/2 对称）' : 'NO');
  if (!same) {
    console.log('plain 前 10:', plain.slice(0, 10).join(','));
    console.log('dec 前 10:', dec.slice(0, 10).join(','));
  }

  // 用不同 ele 反解（模拟遍历）
  let found = false;
  for (let ele = 1; ele <= 256; ele++) {
    const k2 = numarrAddTime([...keys16], runTime, ele / 256)[0];
    const d2 = encryptMode2([...enc], k2, 1);
    if (d2.length === plain.length && d2.every((v, i) => v === plain[i])) { found = true; console.log('ele=' + ele, '匹配!'); break; }
  }
  console.log('ele 遍历找到:', found);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
