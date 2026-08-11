// 检查 base 数组是否藏在 1704 元素 init 数组中（同会话）
const snap = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_k0_kt_same.json');
const idxSeq = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_init_idx.json');
const k0raw = snap.k0Snap.k0.map(Number);
const kt = snap.ktFinal;

function getTree() { let a = []; for (let i = 1; i < 255; i++) a.push({ total: 1, idx: i }); a.push({ total: 6, idx: 255 }, { total: 45, idx: 0 }); function p(it) { for (let i = 0; i < a.length; i++) if (it.total <= a[i].total) { a.splice(i, 0, it); return } a.push(it) } while (a.length > 1) { const [o1, t2] = a.slice(0, 2); a = a.slice(2); p({ total: o1.total + t2.total, first: o1, second: t2 }) } return a[0] }
function gEC(t, c = { key: 0, val: 0 }, arr = []) { if (t.idx === undefined) { gEC(t.first, { key: c.key << 1, val: c.val + 1 }, arr); gEC(t.second, { key: (c.key << 1) + 1, val: c.val + 1 }, arr) } else arr[t.idx] = c; return arr }
const cfg = gEC(getTree()); const byLen = {}; let maxL = 0; for (let b = 0; b < 256; b++) { const c = cfg[b]; if (!c) continue; if (!byLen[c.val]) byLen[c.val] = {}; byLen[c.val][c.key] = b; if (c.val > maxL) maxL = c.val }
function hdecRaw(enc) { const ans = []; let key = 0, val = 0; for (const byte of enc) { for (let b = 7; b >= 0; b--) { key = (key << 1) | ((byte >> b) & 1); val++; const mm = byLen[val]; if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0 } if (val > maxL) { key = 0; val = 0 } } } return ans }

const keys2 = kt.slice(15, 63);
const xor = kt.slice(65).map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
const base = hdecRaw(xor);
console.log('base len:', base.length, 'head:', base.slice(0, 16).join(','));

// 构造 init 数组（同会话 k0 + 索引序列）
const init = idxSeq.map(t => t.type === 'k0' ? k0raw[t.idx] : t.val);
console.log('init len:', init.length);

// 1. base[0:16] 在 init 连续子串
console.log('\n1. base[0:16] 在 init 中连续子串搜索:');
for (let i = 0; i + 16 <= init.length; i++) {
  let ok = true;
  for (let j = 0; j < 16; j++) if (init[i + j] !== base[j]) { ok = false; break; }
  if (ok) console.log('  ★ base[0:16] @init[' + i + ':' + (i + 16) + ']');
}

// 2. base 的每个字节在 init 中的索引（允许分散）
console.log('\n2. base[0:30] 各字节在 init 中首次出现位置:');
const pos = [];
for (let i = 0; i < 30; i++) {
  const idx = init.indexOf(base[i]);
  pos.push(idx);
  console.log('  base[' + i + ']=' + base[i] + ' → init[' + idx + ']');
}
// 检查是否单调递增（如果 base = init 的稀疏子序列）
let mono = true;
for (let i = 1; i < 30; i++) if (pos[i] <= pos[i - 1]) { mono = false; console.log('  非单调 @' + i); break; }
console.log('  索引单调递增:', mono);

// 3. base 每个字节在 k0 中的出现位置（第一次匹配 base 时 init 索引 vs k0 索引关系）
console.log('\n3. base[i] 的 init 索引对应的 k0 索引（k0[init_idx_映射]）:');
// 由于 init[j] = k0[idxSeq[j].idx]，检查 base[i] 对应的 k0 索引序列
const k0IdxSeq = [];
for (let i = 0; i < 30; i++) {
  const v = base[i];
  const k0Idx = k0raw.indexOf(v);
  k0IdxSeq.push(k0Idx);
}
console.log('  base[0:30] → k0 索引:', k0IdxSeq.join(','));
