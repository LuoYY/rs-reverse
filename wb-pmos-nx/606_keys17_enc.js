/**
 * 606_keys17_enc.js
 * 验证 encryptMode2(decrypt(keys22), numarrAddTime(keys17)[0])
 * keys17 = 21 字节（含时间戳+ele），xb 的 [6] 段用 numarrAddTime(keys16)[0]（16→21）
 * nx 可能用 keys17（本身含时间）加密 keys22
 * 对比 nx basearr 动态区 [73-116]
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD } };
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(__dirname, '..', 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(__dirname, '..', 'src/handler/parser/common/numarrAddTime'));
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));
const { ascii2string } = require(path.join(__dirname, '..', 'src/handler/parser'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} ===`);
  console.log('目标 [73-117]:', b.slice(73, 118).map(x => x.toString(16).padStart(2, '0')).join(' '));
  const dec22 = decrypt(ascii2string(k[22]));

  // keys17 各种调用
  const cands = {
    'k17原样': [...k[17]],
    'k17+time': numarrAddTime([...k[17]], 0, 1 / 256)[0],
    'k17默认time': numarrAddTime([...k[17]])[0],
    'k16+time': numarrAddTime([...k[16]])[0],
  };
  for (const [name, key] of Object.entries(cands)) {
    for (const mode of [0, 1]) {
      try {
        const enc = encryptMode2([...dec22], key, mode);
        console.log(`${name} mode=${mode}: len=${enc.length}`, enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
        for (let start = 68; start < b.length - 4; start++) {
          let l = 0;
          while (l < enc.length && start + l < b.length && enc[l] === b[start + l]) l++;
          if (l >= 4) console.log(`  ★ 匹配 basearr[${start}] ${l} 字节`);
        }
      } catch (e) { console.log(`${name} 失败:`, e.message.substring(0, 50)); }
    }
  }
}
process.exit(0);
