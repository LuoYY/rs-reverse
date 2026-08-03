/** 596_enc_debug 调试 encryptMode2 空输出 */
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
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));
const { ascii2string } = require(path.join(__dirname, '..', 'src/handler/parser'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
const k = d[0].keys;
console.log('cfgnum 存在:', !!gv.cfgnum, 'bignum:', !!gv.bignum, 'decryptKeys:', !!gv.decryptKeys);
if (gv.cfgnum) console.log('cfgnum[0][4] len:', gv.cfgnum[0][4] ? gv.cfgnum[0][4].length : '无');
const dec22 = decrypt(ascii2string(k[22]));
console.log('dec22 len:', dec22.length, dec22.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('k[16] len:', k[16].length, k[16].map(x => x.toString(16).padStart(2, '0')).join(' '));
const rev = [...dec22].reverse();
console.log('rev len:', rev.length);
try {
  const enc = encryptMode2(rev, [...k[16]], 0);
  console.log('enc len:', enc.length, enc.map(x => x.toString(16).padStart(2, '0')).join(' '));
} catch (e) {
  console.log('enc 错误:', e.message, e.stack.split('\n').slice(0, 4).join(' | '));
}
