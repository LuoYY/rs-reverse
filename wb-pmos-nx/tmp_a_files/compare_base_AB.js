// 对比两次运行的 base（从 arg0 明文 huffman 解码）
const A = require('./nx_arg0_runA.json');
const B = require('./nx_arg0_runB.json');

function huffmanDecode(enc, keys2) {
  const xor = enc.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
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
  const ans = []; let key = 0, val = 0;
  for (const byte of xor) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((byte >> b) & 1); val++;
      const mm = byLen[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}

// keys2 从 ktFinal [15:63]
const k2A = A.ktFinal.slice(15, 63);
const k2B = B.ktFinal.slice(15, 63);
console.log('keys2 A==B:', JSON.stringify(k2A) === JSON.stringify(k2B));
console.log('arg0 A==B:', JSON.stringify(A.arg0) === JSON.stringify(B.arg0));
console.log('arg1 A==B:', JSON.stringify(A.arg1) === JSON.stringify(B.arg1));

const baseA = huffmanDecode(A.arg0, k2A);
const baseB = huffmanDecode(B.arg0, k2B);
console.log('\nbaseA len=' + baseA.length + ' head=' + baseA.slice(0, 22).join(','));
console.log('baseB len=' + baseB.length + ' head=' + baseB.slice(0, 22).join(','));
console.log('base 完全相同?', JSON.stringify(baseA) === JSON.stringify(baseB));

const m = Math.min(baseA.length, baseB.length);
const diffs = [];
for (let i = 0; i < m; i++) if (baseA[i] !== baseB[i]) diffs.push(i);
console.log('base 差异位置 (' + diffs.length + '):', diffs.join(','));
if (diffs.length > 0 && diffs.length < 50) {
  diffs.forEach(i => console.log('  @' + i + ': A=' + baseA[i] + ' B=' + baseB[i]));
}
console.log('\nbaseA[22:29]:', baseA.slice(22, 29).join(','));
console.log('baseB[22:29]:', baseB.slice(22, 29).join(','));
console.log('baseA[68:73]:', baseA.slice(68, 73).join(','));
console.log('baseB[68:73]:', baseB.slice(68, 73).join(','));
require('fs').writeFileSync('./nx_base_runA.json', JSON.stringify(baseA));
require('fs').writeFileSync('./nx_base_runB.json', JSON.stringify(baseB));
