/**
 * 728_base_const_search.js
 * 在 dynCode / app js / 既有资产中搜索 base 固定段值
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

const s0 = samples[0];
const HEAD = s0.base.slice(0, 22).join(',');
const FIX = s0.base.slice(26, 56).join(',');

console.log('base HEAD:', HEAD);
console.log('base FIX[26:56]:', FIX);

// 在 dynCode 搜索
const dyn = fs.readFileSync('/tmp/nx_appjs_dyn_2.js', 'utf8');
console.log('\nHEAD in dynCode:', dyn.includes(HEAD));
console.log('FIX in dynCode:', dyn.includes(FIX));

// 在 app js 搜索
const app = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/c9qYRt1w5yKr/Dl5ApMEho6Yq.2437991.js', 'utf8');
console.log('HEAD in appjs:', app.includes(HEAD));
console.log('FIX in appjs:', app.includes(FIX));

// 在 challenge js 搜索
const ch = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js', 'utf8');
console.log('HEAD in challenge:', ch.includes(HEAD));

// 检查 base[0:22] 是否 = huffman 编码某固定文本的前缀
// 尝试解码 HEAD 为文本
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
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
function huffmanDecodeRaw(enc) {
  const encCfg = getEncCfg(getTree());
  const byLenMap = {}; let maxL = 0;
  for (let idx = 0; idx < 256; idx++) {
    const c = encCfg[idx];
    if (!c) continue;
    if (!byLenMap[c.val]) byLenMap[c.val] = {};
    byLenMap[c.val][c.key] = idx;
    if (c.val > maxL) maxL = c.val;
  }
  const ans = [];
  let key = 0, val = 0;
  for (let i = 0; i < enc.length; i++) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((enc[i] >> b) & 1);
      val++;
      const mm = byLenMap[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}
const decHead = huffmanDecodeRaw(s0.base.slice(0, 22));
console.log('\nHEAD huffman解码:', decHead.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// 检查 base 是否是 numarr2string 的某种表示（B86 字符）
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
// base 值是否都在 NX_BS 索引范围内（0-85）？如果 base 是 b86 字符索引
const maxVal = Math.max(...s0.base);
const minVal = Math.min(...s0.base);
console.log('\nbase 值域:', minVal, '-', maxVal, '(NX_BS len:', NX_BS.length + ')');
