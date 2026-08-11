// 分析 base(153B) 是否 = _$k0(423) 的固定索引序列取值
// 如果 base[i] = k0[idx[i]] 且 idx 固定 → base 程序化生成（无需硬编码）
const snap = require('./nx_k0_kt_same.json');
const base = require('./nx_base_from_arg0.json');
const k0 = snap.k0Snap.k0;

console.log('base len:', base.length, 'k0 len:', k0.length);
console.log('base head:', base.slice(0, 22).join(','));
console.log('k0[0:30]:', k0.slice(0, 30).join(','));

// 1) base[i] 在 k0 中所有出现位置
const pos = base.map(b => {
  const all = [];
  k0.forEach((v, i) => { if (v === b) all.push(i); });
  return all;
});
// 统计每字节的可选索引数
const opt = pos.map(p => p.length);
console.log('\n每字节可选 k0 索引数:', opt.join(','));
const multi = opt.filter(n => n > 1).length;
const zero = opt.filter(n => n === 0).length;
console.log('多解字节:', multi, '无解字节:', zero);

// 2) 寻找一个单调递增索引序列（base 可能是 k0 的有序子集）
// 贪心：每个 base[i] 取 > 前一索引的最小可用索引
let seq = [], prev = -1, fail = 0;
for (let i = 0; i < base.length; i++) {
  const cand = pos[i].filter(p => p > prev).sort((a, b) => a - b);
  if (cand.length) { seq.push(cand[0]); prev = cand[0]; }
  else { seq.push(-1); fail++; }
}
console.log('\n单调索引序列: fail=' + fail);
console.log('seq:', seq.join(','));
// 索引差分
const diff = [];
for (let i = 1; i < seq.length; i++) if (seq[i] > 0 && seq[i - 1] > 0) diff.push(seq[i] - seq[i - 1]);
console.log('索引差分:', diff.join(','));

// 3) base 是否 = k0 的某段连续子序列（考虑 k0 可能含 0 分隔符）
// 先看 k0 中 179 的位置
console.log('\nk0 中 179 的位置:', pos[0].join(','));
console.log('k0 中 0 的个数:', k0.filter(v => v === 0).length, '位置:', k0.map((v, i) => v === 0 ? i : -1).filter(i => i >= 0).join(','));

// 4) base[0:22] fixedHead 与 k0 的关系
console.log('\nfixedHead 每字节 k0 位置:', base.slice(0, 22).map(b => pos[base.indexOf(b)][0]).join(','));
