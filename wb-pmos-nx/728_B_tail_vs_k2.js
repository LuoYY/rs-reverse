/**
 * 728_B_tail_vs_k2.js
 * 检查 base[68:] 与 keys2 的绑定关系
 * base[68:] 长度 97-103 ≈ 2×48 (keys2 48B)
 * 可能 base[68:] = keys2 的某种编码 + 其他
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

// base[68:] 长度 vs keys2 huffman
console.log('=== base[68:] vs huff(keys2) ===');
for (const s of samples.slice(0, 5)) {
  const tail = s.base.slice(68);
  const hk = nxEncrypt(s.keys2);
  console.log(`nsd=${s.nsd}: tail=${tail.length} huff(k2)=${hk.length} huff(k2)x2=${hk.length * 2}`);
  // huff(keys2) 是否出现在 tail 中
  const tStr = tail.join(',');
  console.log(`  huff(k2) 在 tail: ${tStr.indexOf(hk.join(','))}`);
  // 前 48B 是否 = huff(k2) 前 48
  let m = 0;
  for (let i = 0; i < Math.min(hk.length, tail.length); i++) { if (hk[i] === tail[i]) m++; else break; }
  console.log(`  huff(k2) 前缀匹配: ${m}`);
}

// base[68:] 是否 = [keys2 相关][其他]
// 检查 base[68:116] 与 keys2 是否是"密码学绑定"（如加密结果）
// encryptMode1(keys2) 或 XOR keys17？
// 用 keys17 需要派生。先看 keys2 是否有自相关
console.log('\n=== base[68:] 分段与 keys2 关系 ===');
for (const s of samples.slice(0, 3)) {
  const tail = s.base.slice(68);
  console.log(`nsd=${s.nsd}:`);
  console.log(`  tail[0:24]=${tail.slice(0, 24).join(',')}`);
  console.log(`  k2[0:24]=${s.keys2.slice(0, 24).join(',')}`);
}
