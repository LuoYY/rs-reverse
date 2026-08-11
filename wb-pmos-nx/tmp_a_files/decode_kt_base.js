// 解码 _$kt[65:]（base 编码）→ XOR keys2 → huffman → base 原始数组
const kt = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');
const keys2 = kt.slice(15, 63); // 48B keys2
const beEnc = kt.slice(65); // 144B base 编码
console.log('keys2 len:', keys2.length, 'beEnc len:', beEnc.length);

// beEnc XOR keys2[0:16] → numarrEncrypt(base)
const xor = beEnc.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
console.log('XOR 后 head:', xor.slice(0, 16).join(','));

// numarrEncrypt 是 huffman 编码。huffman 解码 → base
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
function hdecRaw(enc) {
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
const base = hdecRaw(xor);
console.log('\nbase 解码 len:', base.length);
console.log('base head:', base.slice(0, 16).join(','));
console.log('base[0:4] (59?):', base[0], base[1], base[2], base[3]);

// 验证 base 头：sdenv 环境应该是 59,148,7,120 或类似
console.log('\n如果 base[0]=59 → base 头固定');
console.log('base[22:29]:', base.slice(22, 29).join(','));
console.log('base[78:90]:', base.slice(78, 90).join(','));
// 保存
require('fs').writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_base_from_kt.json', JSON.stringify(base));
