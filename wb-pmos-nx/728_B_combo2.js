/**
 * 728_B_combo2.js
 * 系统测试 base[68:] 是否由 cd 派生数组的 huffman 编码组合
 * base[68:] 长度 97-103
 * keys2 48B → huff ~50B
 * 也许 base[68:] = nxEncrypt(keys2) + nxEncrypt(keys2) 等？
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

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
let huffEncCfg = null;
function nxEncrypt(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  let one = 0, two = 0;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
  return ans;
}

const s0 = samples[0];
const tail = s0.base.slice(68);
console.log('base[68:] len:', tail.length);
console.log('tail:', tail.join(','));

// keys2 huffman
const hk = nxEncrypt(s0.keys2);
console.log('\nhuff(keys2) len:', hk.length, ':', hk.join(','));

// 尝试 base[68:] = huff(keys2) + X？
// 前缀匹配
let m = 0;
for (let i = 0; i < Math.min(hk.length, tail.length); i++) { if (hk[i] === tail[i]) m++; else break; }
console.log('huff(keys2) 前缀匹配:', m);

// 反向：tail 是否以 huff(keys2) 结尾？
const rev = tail.slice(-hk.length);
let rm = 0;
for (let i = 0; i < hk.length; i++) { if (hk[i] === rev[i]) rm++; else break; }
console.log('huff(keys2) 尾部匹配:', rm);

// 尝试 base[68:] = nxEncrypt(keys2 变体)？
// keys2 可能经过 numarrAddTime 或 XOR
// 先看 base[68:] 是否含 keys2 的 huffman 编码（任意位置）
const bStr = tail.join(',');
console.log('huff(keys2) 在 tail 中:', bStr.indexOf(hk.join(',')));
