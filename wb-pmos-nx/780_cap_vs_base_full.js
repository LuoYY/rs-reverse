/**
 * 780_cap_vs_base_full.js
 * 决定性分析：cap（明文 basearr）与 base179（服务器接受）的完整关系
 * 同一会话数据（triple 数据集：cd/cap/base179/keys2/be/beLen）
 * 1. 长度关系
 * 2. cap 是否 = base 的"明文版"（base 加密前的数据）
 * 3. base[68:92] 敏感区是否 = cap 某段的变换
 * 4. 两者是否 = be 段的不同解码
 */
const fs = require('fs');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}
// 完整对比 86155
const s = trip[0];
console.log('=== nsd=' + s.nsd + ' 完整数据 ===');
console.log('cap len=' + s.cap.length + ' base len=' + s.base.length + ' be len=' + s.be.length + ' beLen=' + s.beLen);
console.log('cap[0:40]: ' + s.cap.slice(0, 40).join(','));
console.log('base[0:40]: ' + s.base.slice(0, 40).join(','));
console.log();

// cap vs base 长度差
trip.forEach(s => {
  console.log('nsd=' + s.nsd + ': cap=' + s.cap.length + ' base=' + s.base.length + ' 差=' + (s.cap.length - s.base.length) + ' be=' + s.be.length + ' beLen=' + s.beLen);
});
console.log();

// 关键：be 段的明文是什么？base 是 be 的 huffman 解码。
// cap 是否是另一个"明文"？对比 cap 和 base 的 huffman 编码
const getTree = () => {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  const parse = (item) => { for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } } arr.push(item); };
  while (arr.length > 1) { const [one, two] = arr.slice(0, 2); arr = arr.slice(2); parse({ total: one.total + two.total, first: one, second: two }); }
  return arr[0];
};
const getEncCfg = (tree, config = { key: 0, val: 0 }, arr = []) => {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
};
let huffCfg = null;
function nxEncrypt(numarr) {
  if (!huffCfg) huffCfg = getEncCfg(getTree());
  const ans = []; let one = 0, two = 0;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffCfg[numarr[i]];
    one = one << cfg.val | cfg.key; two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
  return ans;
}

console.log('=== cap vs base huffman 编码长度 ===');
trip.forEach(s => {
  const encCap = nxEncrypt(s.cap);
  const encBase = nxEncrypt(s.base);
  console.log('nsd=' + s.nsd + ': cap→huff=' + encCap.length + ' base→huff=' + encBase.length + ' be=' + s.be.length);
  // 对比与 be 的相似度
  let mCap = 0, mBase = 0;
  for (let i = 0; i < Math.min(encCap.length, s.be.length); i++) if (encCap[i] === s.be[i]) mCap++;
  for (let i = 0; i < Math.min(encBase.length, s.be.length); i++) if (encBase[i] === s.be[i]) mBase++;
  console.log('  与 be 匹配: cap=' + mCap + '/' + encCap.length + ' base=' + mBase + '/' + encBase.length);
});
