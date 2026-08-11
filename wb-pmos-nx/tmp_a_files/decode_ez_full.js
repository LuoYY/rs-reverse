// 完整解码 _$ez[143]/[209]/[1532]：XOR pL 还原 + huffman 解码 → 找 base
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_base_pair.json', 'utf8'));
const pL = [0, 52, 3, 0, 5, 5, 7, 7];

function getTree() {
  let a = [];
  for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i });
  a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) }
  while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) }
  return a[0];
}
function gEC(t, c = { key: 0, val: 0 }, arr = []) {
  if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) }
  else arr[t.idx] = c;
  return arr;
}
const cfg = gEC(getTree());
const byLen = {}; let maxL = 0;
for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val; }
function hdec(enc) {
  const ans = []; let key = 0, val = 0;
  for (const byte of enc) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((byte >> b) & 1); val++;
      const mm = byLen[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}
// 输出 huffman 码表供对比
console.log('huff cfg[59]=', cfg[59], 'cfg[148]=', cfg[148], 'cfg[7]=', cfg[7], 'cfg[120]=', cfg[120]);

for (const len of [143, 209, 1532]) {
  const ez = data[len];
  if (!ez) continue;
  console.log('\n=== _$ez[' + len + '] (' + ez.t + ') ===');
  // XOR pL（8 字节循环）
  const xor = ez.full.map((v, i) => v ^ pL[i % 8]);
  console.log('原始 head:', ez.full.slice(0, 12).join(','));
  console.log('XOR后 head:', xor.slice(0, 12).join(','));
  const dec = hdec(xor);
  console.log('huff解码(' + len + 'B)→', dec.length, '个');
  console.log('解码 head:', dec.slice(0, 20).join(','));
  if (dec[0] === 59 || dec[0] === 179) console.log('★★ 找到 base 头! len=' + dec.length);
}
