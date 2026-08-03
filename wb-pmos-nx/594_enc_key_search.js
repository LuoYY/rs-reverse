/**
 * 594_enc_key_search.js
 * 穷举 encryptMode2(decrypt(keys22), X) 中 X = 各种 16 字节 keys
 * 对比 basearr[80-83]（动态段）
 * 也试 encryptMode2(decrypt(keys22), X, mode 变体)
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
const { ascii2string, numToNumarr2 } = require(path.join(__dirname, '..', 'src/handler/parser'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} ===`);
  console.log('目标 [80-87]:', b.slice(80, 88).map(x => x.toString(16).padStart(2, '0')).join(' '));
  const dec22 = decrypt(ascii2string(k[22]));
  console.log('dec22 len:', dec22.length);

  // 候选密钥：所有 16 字节 keys + numarrAddTime 变体
  const cands = {};
  for (let ki = 0; ki < k.length; ki++) {
    if (!k[ki]) continue;
    if (k[ki].length === 16) {
      cands[`keys[${ki}]`] = [...k[ki]];
      cands[`keys[${ki}]+time`] = numarrAddTime([...k[ki]], 0, 1 / 256)[0];
    }
  }
  // 也试 keys16 = numarrAddTime(keys16)
  if (k[16]) {
    cands['keys16'] = [...k[16]];
    cands['keys16+time'] = numarrAddTime([...k[16]], 0, 1 / 256)[0];
  }

  let found = false;
  for (const [name, key] of Object.entries(cands)) {
    for (const mode of [0, 1]) {
      try {
        const enc = encryptMode2([...dec22], key, mode);
        // 匹配 basearr 任何位置（前4字节）
        for (let start = 70; start < b.length - 4; start++) {
          if (enc.slice(0, 4).every((v, j) => v === b[start + j])) {
            console.log(`★★ encryptMode2(dec22, ${name}, mode=${mode}) 匹配 basearr[${start}]: ${enc.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
            found = true;
          }
        }
        // 也试 dec22 反转
        const rev = [...dec22].reverse();
        const enc2 = encryptMode2(rev, key, mode);
        for (let start = 70; start < b.length - 4; start++) {
          if (enc2.slice(0, 4).every((v, j) => v === b[start + j])) {
            console.log(`★★ encryptMode2(rev(dec22), ${name}, mode=${mode}) 匹配 basearr[${start}]`);
            found = true;
          }
        }
      } catch (e) {}
    }
  }
  if (!found) console.log('无匹配');
}
process.exit(0);
