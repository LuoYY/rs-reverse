/**
 * 607_seg6_r2mka.js
 * 验证 nx [73-116] = encryptMode2(decrypt(keys22), numarrAddTime(keys16, r2mkaTime)[0])
 * 用 keys21（r2mkaTime）作为 numarrAddTime 的 time 参数
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
  const k21 = +k[21].map(c => String.fromCharCode(c)).join('');
  console.log(`\n=== S${i + 1} r2mkaTime=${k21} ===`);
  console.log('目标 [73-117]:', b.slice(73, 118).map(x => x.toString(16).padStart(2, '0')).join(' '));
  const dec22 = decrypt(ascii2string(k[22]));

  // numarrAddTime(keys16, r2mkaTime, random) —— time = r2mkaTime
  for (const random of [1 / 256, Math.random()]) {
    try {
      const [key16t] = numarrAddTime([...k[16]], k21, random);
      console.log('key16t:', key16t.map(x => x.toString(16).padStart(2, '0')).join(' '));
      const enc = encryptMode2([...dec22], key16t, 0);
      console.log('enc:', enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
      for (let start = 68; start < b.length - 4; start++) {
        let l = 0;
        while (l < enc.length && start + l < b.length && enc[l] === b[start + l]) l++;
        if (l >= 4) console.log(`  ★ 匹配 basearr[${start}] ${l} 字节`);
      }
    } catch (e) { console.log('失败:', e.message.substring(0, 50)); }
  }
}
process.exit(0);
