// huffman 解码 _$mD[615] 输出数组，分析结构 + 对比真实 base
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_mD_calls.json');
const ktFinal = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');

function getTree() { let a = []; for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }

// 真实 base：ktFinal[65:] XOR keys2 → huffman
const keys2 = ktFinal.slice(15, 63);
const xor = ktFinal.slice(65).map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
const base = hdecRaw(xor);
console.log('真实 base len:', base.length, 'head:', base.slice(0, 20).join(','));

// a0 (230B, ez=1024)
const a0 = calls[0].after;
const b0 = hdecRaw(a0);
console.log('\na0(230B) huffman 解码 len:', b0.length);
console.log('head:', b0.slice(0, 20).join(','));
// 与 base 对比
let m = 0;
for (let i = 0; i < Math.min(b0.length, base.length); i++) if (b0[i] === base[i]) m++;
console.log('a0 解码 vs base 匹配:', m + '/' + Math.min(b0.length, base.length));

// a1 (128B, ez=128)
const a1 = calls[1].after;
const b1 = hdecRaw(a1);
console.log('\na1(128B) huffman 解码 len:', b1.length);
console.log('head:', b1.slice(0, 20).join(','));
m = 0;
for (let i = 0; i < Math.min(b1.length, base.length); i++) if (b1[i] === base[i]) m++;
console.log('a1 解码 vs base 匹配:', m + '/' + Math.min(b1.length, base.length));

// a0 头 65 字节结构检查（可能含 nextarr 头）
console.log('\na0[0:65]:', a0.slice(0, 65).join(','));
console.log('ktFinal[0:65]:', ktFinal.slice(0, 65).join(','));
