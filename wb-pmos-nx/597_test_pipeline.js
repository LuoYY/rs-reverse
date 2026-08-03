/**
 * 597_test_pipeline.js
 * 用 xb 管线 len243.js 结构 + nx keys 生成 basearr，对比浏览器 basearr
 * 检查 xb 的 [6] 段（keys22 加密）是否正确生成 nx 动态段
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD, getKey: 0x68 } };
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();

const parser = require(path.join(__dirname, '..', 'src/handler/parser'));
const { encryptMode2, encryptMode1 } = require(path.join(__dirname, '..', 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(__dirname, '..', 'src/handler/parser/common/numarrAddTime'));
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));
const { ascii2string, numToNumarr2 } = parser;

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} ===`);
  const dec22 = decrypt(ascii2string(k[22]));
  console.log('dec22:', dec22.length, '字节');
  // xb [6] 段: [1, 2, 2, hidden, ...encryptMode2(decrypt(keys22), keys16), ...numToNumarr2(+decode(decrypt(keys22)))]
  // 直接试 encryptMode2 各变体
  const variants = [
    ['rev+keys16', [...dec22].reverse(), [...k[16]], 0],
    ['rev+keys16t', [...dec22].reverse(), numarrAddTime([...k[16]], 0, 1/256)[0], 0],
    ['直+keys16', [...dec22], [...k[16]], 0],
    ['直+keys16t', [...dec22], numarrAddTime([...k[16]], 0, 1/256)[0], 0],
    ['rev+keys16m1', [...dec22].reverse(), [...k[16]], 1],
  ];
  for (const [name, input, key, mode] of variants) {
    try {
      const enc = encryptMode2(input, key, mode);
      console.log(`${name}: len=${enc.length}`, enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
      // 与 basearr 对比
      for (let start = 68; start < b.length; start++) {
        let len = 0;
        while (len < enc.length && start + len < b.length && enc[len] === b[start + len]) len++;
        if (len >= 4) console.log(`  ★ 匹配 basearr[${start}] ${len} 字节`);
      }
    } catch (e) {
      console.log(`${name} 失败:`, e.message.substring(0, 60));
    }
  }
}
process.exit(0);
