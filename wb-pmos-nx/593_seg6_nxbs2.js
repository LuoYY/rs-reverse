/**
 * 593_seg6_nxbs2.js
 * 用 nx cdBasestr 构造 decryptKeys，验证 [6] 段公式：
 * encryptMode2(decrypt(keys22), numarrAddTime(keys16)[0]) 是否 = nx basearr 尾部
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));

// 设置 nx cdBasestr → decryptKeys
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD } };
// 重建 decryptKeys
const { init } = require(path.join(__dirname, '..', 'src/handler/parser/constData'));
init();

const { encryptMode2, encryptMode1 } = require(path.join(__dirname, '..', 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(__dirname, '..', 'src/handler/parser/common/numarrAddTime'));
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));
const { ascii2string, numToNumarr2 } = require(path.join(__dirname, '..', 'src/handler/parser'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  console.log(`\n=== S${i + 1} ===`);
  console.log('basearr[84-88]:', b.slice(84, 89).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('basearr[80-90]:', b.slice(80, 91).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('keys22:', ascii2string(k[22]));
  console.log('keys22 hex:', k[22].map(x => x.toString(16).padStart(2, '0')).join(' '));

  // decrypt(keys22) —— keys22 是 cd 字符集编码的？
  try {
    const dec22 = decrypt(ascii2string(k[22]));
    console.log('decrypt(keys22):', dec22.map(x => x.toString(16).padStart(2, '0')).join(' '));
    const enc = encryptMode2([...dec22], numarrAddTime([...k[16]])[0], 0);
    console.log('encryptMode2(dec22, keys16):', enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
    // 对比 basearr 尾部
    for (let start = 70; start < b.length - enc.length; start++) {
      let match = true;
      for (let j = 0; j < enc.length; j++) if (enc[j] !== b[start + j]) { match = false; break; }
      if (match) console.log(`★★ encryptMode2(dec22) 匹配 basearr[${start}]`);
    }
    // 前4字节对比 [84-87]
    console.log('enc 前4:', enc.slice(0, 4).map(x => x.toString(16).padStart(2, '0')).join(' '), 'vs [84-87]:', b.slice(84, 88).map(x => x.toString(16).padStart(2, '0')).join(' '));
    // decrypt 直接转 numToNumarr2
    console.log('dec22 长度:', dec22.length);
  } catch (e) {
    console.log('失败:', e.message.substring(0, 80));
  }
}
process.exit(0);
