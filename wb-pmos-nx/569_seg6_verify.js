/**
 * 569_seg6_verify.js
 * 验证 nx basearr 尾部（69-116）是否为 xb len243.js [6] 段公式：
 * encryptMode2(decrypt(ascii2string(keys[22])), numarrAddTime(keys[16])[0])
 * xb [6] 段完整结构: [1, 2, 2, hidden, ...encryptMode2(decrypt(keys22), keys16), ...numToNumarr2(+decode(decrypt(keys22)))]
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const parser = require(path.join(__dirname, '..', 'src/handler/parser'));

const { decrypt, encryptMode2, numarrAddTime, ascii2string, numToNumarr2 } = parser;

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let s = 0; s < 2; s++) {
  const b = d[s].basearr;
  const keys = d[s].keys;
  console.log(`\n=== S${s + 1} ===`);
  console.log('basearr[69-120]:', b.slice(69, 121).map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('keys22:', keys[22].map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('keys22 ascii:', ascii2string(keys[22]));

  try {
    const k22s = ascii2string(keys[22]);
    // decrypt: xb 用法 decrypt(ascii2string(keys[22])) —— keys22 是 base64? 看 decrypt 实现
    let decK22 = null;
    try { decK22 = decrypt(k22s); } catch (e) { console.log('decrypt(keys22) 失败:', e.message.substring(0, 40)); }
    if (decK22) {
      console.log('decrypt(keys22):', decK22.map(x => x.toString(16).padStart(2, '0')).join(' '));
      // encryptMode2(decrypt(keys22), numarrAddTime(keys16)[0])
      const enc = encryptMode2([...decK22], numarrAddTime([...keys[16]])[0]);
      console.log('encryptMode2(decK22, keys16):', enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
      // 对比 basearr 尾部
      console.log('basearr 尾部前', enc.length, '字节:');
      // 找 enc 在 basearr 中的匹配位置
      for (let start = 60; start < b.length - enc.length; start++) {
        if (JSON.stringify(b.slice(start, start + Math.min(4, enc.length))) === JSON.stringify(enc.slice(0, 4))) {
          console.log(`★ enc 匹配 basearr[${start}]: ${b.slice(start, start + enc.length).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
        }
      }
    }
  } catch (e) {
    console.log('S' + (s + 1) + ' 失败:', e.message.substring(0, 80));
  }
}
process.exit(0);
