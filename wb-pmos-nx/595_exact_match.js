/**
 * 595_exact_match.js
 * 精确对比 encryptMode2(rev(decrypt(keys22)), keys[16], mode=0) 输出
 * 与 basearr[70+] 的逐字节匹配（找精确起始位置和长度）
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

for (let i = 0; i < 3; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} basearr len=${b.length} ===`);
  const dec22 = decrypt(ascii2string(k[22]));
  const enc = encryptMode2([...dec22].reverse(), [...k[16]], 0);
  console.log('enc 输出:', enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('basearr[69-116]:', b.slice(69, 117).map(x => x.toString(16).padStart(2, '0')).join(' '));
  // 精确匹配
  for (let start = 60; start < b.length; start++) {
    let len = 0;
    while (len < enc.length && start + len < b.length && enc[len] === b[start + len]) len++;
    if (len >= 4) console.log(`★ basearr[${start}] 匹配 ${len} 字节`);
  }
  // 变体：dec22 不反转 / +time / mode1
  const variants = {
    'rev+keys16': encryptMode2([...dec22].reverse(), [...k[16]], 0),
    'keys16+time': encryptMode2([...dec22].reverse(), numarrAddTime([...k[16]], 0, 1 / 256)[0], 0),
    'mode1': encryptMode2([...dec22].reverse(), [...k[16]], 1),
    '直序': encryptMode2([...dec22], [...k[16]], 0),
  };
  for (const [name, out] of Object.entries(variants)) {
    for (let start = 60; start < b.length; start++) {
      let len = 0;
      while (len < out.length && start + len < b.length && out[len] === b[start + len]) len++;
      if (len >= 4) console.log(`★ ${name} basearr[${start}] 匹配 ${len} 字节`);
    }
  }
}
process.exit(0);
