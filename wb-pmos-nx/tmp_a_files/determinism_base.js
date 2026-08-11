// 决定性测试：两次不同运行的 ktFinal 解出的 base 是否相同？
// nx_k0_kt_same.json (uuid=193,161,13,240) vs nx_ktF_1842.json (uuid=86,193,168,194)
// 本地固定 challenge 127.0.0.1:8080 下 cd 相同 → base 应相同（纯函数）
const snap = require('./nx_k0_kt_same.json');
const kt2 = require('./nx_ktF_1842.json');

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

// 运行1
const kt1 = snap.ktFinal; // 209B
const k21 = kt1.slice(15, 63);
const be1 = kt1.slice(65);
const base1 = huffmanDecode(be1, k21);

// 运行2
const k22 = kt2.slice(15, 63);
const be2 = kt2.slice(65);
const base2 = huffmanDecode(be2, k22);

console.log('运行1 base len=' + base1.length + ' head=' + base1.slice(0, 22).join(','));
console.log('运行2 base len=' + base2.length + ' head=' + base2.slice(0, 22).join(','));
console.log('keys2 相同?', JSON.stringify(k21) === JSON.stringify(k22));
console.log('be 相同?', JSON.stringify(be1) === JSON.stringify(be2));

// 逐字节对比
const m = Math.min(base1.length, base2.length);
const diffs = [];
for (let i = 0; i < m; i++) if (base1[i] !== base2[i]) diffs.push(i);
console.log('base 差异位置 (' + diffs.length + '):', diffs.join(','));
if (diffs.length < 40) {
  diffs.forEach(i => console.log('  @' + i + ': run1=' + base1[i] + ' run2=' + base2[i]));
}
console.log('base1[22:29]:', base1.slice(22, 29).join(','));
console.log('base2[22:29]:', base2.slice(22, 29).join(','));
console.log('base1[68:73]:', base1.slice(68, 73).join(','));
console.log('base2[68:73]:', base2.slice(68, 73).join(','));
