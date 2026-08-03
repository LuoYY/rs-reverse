/**
 * 539_verify_seg6.js
 * 验证 len243.js [6] 段假设：
 * encryptMode2(decrypt(ascii2string(keys[22])), numarrAddTime(keys16)[0]) == basearr 动态区
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const decrypt = require('@src/handler/parser/common/decrypt');
const decode = require('@src/handler/parser/common/decode');
const ascii2string = require('@src/handler/parser/common/ascii2string');
const gv = require('@src/handler/globalVarible');

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
console.log('decryptKeys 存在:', !!gv.decryptKeys);

for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const b = d.basearr;
  const k22 = d.keys[22];
  if (!k22) { console.log(`S${i + 1} 无 keys22`); continue; }
  const str = ascii2string(k22);
  console.log(`\nS${i + 1} keys22 len=${k22.length} ascii="${str.substring(0, 40)}"`);
  const dec = decrypt(str);
  console.log(`  decrypt len=${dec.length}: ${dec.slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];
  const enc = encryptMode2([...dec], keys16arr, 0);
  console.log(`  encryptMode2 len=${enc.length}: ${enc.slice(0, 24).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  // 在 basearr 找 enc
  const encStr = enc.join(',');
  const bStr = b.join(',');
  const pos = bStr.indexOf(encStr);
  console.log(`  enc 在 basearr 位置: ${pos >= 0 ? pos / 2 : '未找到'}`);
  // 找前 8 字节
  const head8 = enc.slice(0, 8).join(',');
  let found = [];
  for (let p = 0; p <= b.length - 8; p++) {
    if (b.slice(p, p + 8).join(',') === head8) found.push(p);
  }
  console.log(`  enc[0-7] 匹配位置: ${found.join(',') || '无'}`);
  // decode(decrypt(keys22))
  try {
    const dc = decode(dec);
    console.log(`  decode(decrypt): "${dc.substring(0, 20)}" num=${+dc}`);
  } catch (e) { console.log('  decode err:', e.message.substring(0, 40)); }
}
