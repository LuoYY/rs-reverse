/**
 * 525_analyze_535_basearr.js
 * 离线分析 535 nextarr → 逆向 basearr 明文 → 对比 343 的 basearr
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
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let encCfg = null, byLenMap = null, maxCodeLen = 0;
function initHuff() {
  if (encCfg) return;
  encCfg = getEncryptConfig(getTree());
  byLenMap = {};
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxCodeLen) maxCodeLen = c.val;
  }
}
function huffmanDecodeRaw(enc) {
  initHuff();
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const m = byLenMap[val];
      if (m && m[key] !== undefined) { ans.push(m[key]); key = 0; val = 0; }
      if (val > maxCodeLen) { key = 0; val = 0; }
    }
  }
  return ans;
}

// 需要 keys17 解密 be。535 的 keys17 未知（cd 没保存）。但可以先看 be 结构。
const na = JSON.parse(fs.readFileSync('/tmp/nextarr535.json', 'utf8')).slice(4);
console.log('535 nextarr(无uuid) len:', na.length);
console.log('535 na[0-11]:', na.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('535 na[59]:', na[59].toString(16), 'na[60]:', na[60], 'na[61]:', na[61].toString(16));
// be 从哪开始？beLen 需要知道编码。试 na[61:]
const be = na.slice(61);
console.log('be(61+) len:', be.length);

// 对比 343 的 na
const na343 = JSON.parse(fs.readFileSync('/tmp/naA.json', 'utf8'));
console.log('\n343 na[0-11]:', na343.slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('343 na[59]:', na343[59].toString(16), 'na[60]:', na343[60].toString(16));

// 打印 535 na 全结构（60-70）
console.log('\n535 na[55-75]:', na.slice(55, 76).map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('343 na[55-75]:', na343.slice(55, 76).map(b => b.toString(16).padStart(2, '0')).join(' '));
