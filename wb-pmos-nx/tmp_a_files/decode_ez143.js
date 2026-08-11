// 解码 _$ez 143 长度：huffman 解码 → 应该得到 base！
// 同时用真实 base 做对照
const fs = require('fs');
const ezs = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_before_xor.json', 'utf8'));

// huffman 码表（nx 专属：1-254 码长1，255 码长6，0 码长45）
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
  const ans = [];
  let key = 0, val = 0;
  for (const byte of enc) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((byte >> b) & 1);
      val++;
      const mm = byLen[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}

console.log('=== huffman 解码 _$ez[143] ===');
const ez143 = ezs['143'];
console.log('_$ez[143] head:', ez143.head.join(','));
console.log('_$ez[143] tail:', ez143.tail.join(','));
// 只有 head 80 + tail 20，无法完整解码。但先看 head 能解出什么
const full143 = [...ez143.head, ...Array(43).fill(0)]; // 占位
const dec143 = hdec(ez143.head);
console.log('解码 head(80B) →', dec143.length, '个:', dec143.join(','));

console.log('\n=== huffman 解码 _$ez[209] ===');
const ez209 = ezs['209'];
console.log('_$ez[209] head:', ez209.head.join(','));
const dec209 = hdec(ez209.head);
console.log('解码 head(80B) →', dec209.length, '个:', dec209.join(','));

// 209 head 含 4,8（nextarr 头）→ 解码后应该看到 [4,8] + ...
console.log('\n=== 检查解码结果是否含 4,8 头 ===');
