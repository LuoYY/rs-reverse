/**
 * 599_seg6_final.js
 * 用 xb len243.js 完全相同的调用方式验证 [6] 段：
 * encryptMode2(decrypt(keys22), numarrAddTime(keys[16])[0])
 * （numarrAddTime 默认参数：当前时间戳 + 随机 ele）
 * 输出 24 字节 → 与 basearr[69+] 对比
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
  const dec22 = decrypt(ascii2string(k[22]));
  // xb 调用：numarrAddTime(keys16)[0]（当前时间 + 随机）
  const [key16t] = numarrAddTime([...k[16]]);
  console.log('key16t len:', key16t.length, key16t.map(x => x.toString(16).padStart(2, '0')).join(' '));
  const enc = encryptMode2([...dec22], key16t, 0);
  console.log('enc len:', enc.length, enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
  console.log('basearr[69-92]:', b.slice(69, 93).map(x => x.toString(16).padStart(2, '0')).join(' '));
  // 匹配
  for (let start = 60; start < b.length; start++) {
    let len = 0;
    while (len < enc.length && start + len < b.length && enc[len] === b[start + len]) len++;
    if (len >= 4) console.log(`★ 匹配 basearr[${start}] ${len} 字节`);
  }
  // 逆序
  const encRev = encryptMode2([...dec22].reverse(), key16t, 0);
  console.log('encRev len:', encRev.length);
  for (let start = 60; start < b.length; start++) {
    let len = 0;
    while (len < encRev.length && start + len < b.length && encRev[len] === b[start + len]) len++;
    if (len >= 4) console.log(`★ rev 匹配 basearr[${start}] ${len} 字节`);
  }
}
process.exit(0);
