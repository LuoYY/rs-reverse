/**
 * 604_seg6_full.js
 * 全面验证 nx basearr[73-116] 动态区是否 = encryptMode2(decrypt(keys22), X)
 * 遍历 X：keys16/keys16+time/keys17/keys2 前16/keys[1]/keys[0] 等 + mode 0/1
 * 且对比完整输出（不只前4字节）
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
  console.log('目标动态区 [73-117]:', b.slice(73, 118).map(x => x.toString(16).padStart(2, '0')).join(' '));
  const dec22 = decrypt(ascii2string(k[22]));
  console.log('dec22 len:', dec22.length);

  // 密钥候选
  const cands = {};
  for (let ki = 0; ki < k.length; ki++) {
    if (!k[ki]) continue;
    if (k[ki].length === 16) {
      cands[`k[${ki}]`] = [...k[ki]];
    }
  }
  // 所有 16 字节组合（keys[i] XOR keys[j] 前 16）
  for (let a = 0; a < k.length; a++) {
    for (let c = 0; c < k.length; c++) {
      if (!k[a] || !k[c]) continue;
      const x = k[a].slice(0, 16).map((v, j) => v ^ (k[c][j] || 0));
      cands[`k[${a}]^k[${c}]`] = x;
    }
  }

  let best = null;
  for (const [name, key] of Object.entries(cands)) {
    for (const mode of [0, 1]) {
      for (const doTime of [false, true]) {
        const kk = doTime ? numarrAddTime([...key], 0, 1 / 256)[0] : key;
        try {
          const enc = encryptMode2([...dec22], kk, mode);
          // 完整匹配动态区（任意位置）
          for (let start = 70; start < b.length - 8; start++) {
            if (enc.length >= 8) {
              let l = 0;
              while (l < enc.length && start + l < b.length && enc[l] === b[start + l]) l++;
              if (l >= 6 && (!best || l > best.len)) best = { name, mode, doTime, start, len: l, enc };
            }
          }
        } catch (e) {}
      }
    }
  }
  if (best) {
    console.log(`★★ 最佳: ${best.name} mode=${best.mode} time=${best.doTime} basearr[${best.start}] 匹配 ${best.len} 字节`);
    console.log('  enc:', best.enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
  } else {
    console.log('无 ≥6 字节匹配');
  }
}
process.exit(0);
