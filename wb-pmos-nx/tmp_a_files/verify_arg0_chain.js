// ★ 核心验证：op=1842 的 arg0[143] 固定明文
// 假设：arg0[143] = xor(numarrEncrypt(base), keys2, 16)
// 验证：huffman 解码(arg0 ^ keys2) → base 原始数组
// 然后分析 base 与 _$k0 的索引关系（程序化生成）
const snap = require('./nx_k0_kt_same.json');
const calls = require('./nx_1842_calls.json');

const k0 = snap.k0Snap.k0;      // 423
const kt = snap.ktFinal;        // 209
const keys2 = kt.slice(15, 63); // 48B
const fixed143 = calls[0].args[0].x; // 143B 固定明文

console.log('keys2 len:', keys2.length, 'head:', keys2.slice(0,8).join(','));
console.log('fixed143[0:16]:', fixed143.slice(0,16).join(','));

// 1) numarrEncrypt(base) = fixed143 ^ keys2[0:16]
const enc = fixed143.map((v, i) => i < 16 ? (v ^ keys2[i]) : v);
console.log('numarrEncrypt(base)[0:16]:', enc.slice(0,16).join(','));

// 2) huffman 解码（复用 decode_kt_base.js 逻辑）
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
function hdecRaw(e) {
  const ans = []; let key = 0, val = 0;
  for (const byte of e) {
    for (let b = 7; b >= 0; b--) {
      key = (key << 1) | ((byte >> b) & 1); val++;
      const mm = byLen[val];
      if (mm && mm[key] !== undefined) { ans.push(mm[key]); key = 0; val = 0; }
      if (val > maxL) { key = 0; val = 0; }
    }
  }
  return ans;
}
const base = hdecRaw(enc);
console.log('\n★ base 解码 len:', base.length);
console.log('★ base head:', base.slice(0, 22).join(','));
console.log('★ base[22:29]:', base.slice(22, 29).join(','));
console.log('★ base[68:73]:', base.slice(68, 73).join(','));
console.log('★ base tail:', base.slice(-20).join(','));

// 3) base 与 _$k0 的索引关系：base[i] 是否 = k0[固定索引序列]？
const k0map = {};
k0.forEach((v, i) => { if (!(v in k0map)) k0map[v] = i; });
console.log('\n=== base 与 k0 索引关系 ===');
// 尝试 base[i] = k0[i + offset]?
for (let off = 0; off < 50; off++) {
  let same = 0;
  for (let i = 0; i < Math.min(base.length, k0.length - off); i++) if (base[i] === k0[i + off]) same++;
  if (same > base.length * 0.7) console.log('  base[i] == k0[i+' + off + '] 匹配 ' + same + '/' + base.length);
}
// 尝试 base = k0[idxSeq] 索引模式：打印 base 每字节在 k0 的首现位置
const pos = base.map(b => (b in k0map) ? k0map[b] : -1);
console.log('base→k0 索引位置:', pos.slice(0, 40).join(','));

// 4) 检查 base 是否在 kt 初始化索引序列（nx_kt_init_idx.json）中出现
try {
  const idxSeq = require('./nx_kt_init_idx.json');
  console.log('\nidxSeq len:', idxSeq.length);
  // idxSeq 是 [{type:'k0',idx:N}|{type:'val',val:V}]，检查 base 能否匹配 init 数组的某窗口
  const init = idxSeq.map(t => t.type === 'k0' ? k0[t.idx] : t.val);
  let best = 0, bestPos = -1;
  for (let i = 0; i <= init.length - base.length; i++) {
    let l = 0;
    while (l < base.length && init[i + l] === base[l]) l++;
    if (l > best) { best = l; bestPos = i; }
  }
  console.log('base 在 init 中最长匹配:', best, '@' + bestPos, 'init len:', init.length);
} catch (e) { console.log('nx_kt_init_idx.json 不存在或错误:', e.message); }

// 5) base 是否 = k0 前 N 字节？
let sameFront = 0;
for (let i = 0; i < Math.min(base.length, k0.length); i++) if (base[i] === k0[i]) sameFront++;
console.log('base[0:N] vs k0[0:N] 匹配:', sameFront + '/' + Math.min(base.length, k0.length));
require('fs').writeFileSync('./nx_base_from_arg0.json', JSON.stringify(base));
