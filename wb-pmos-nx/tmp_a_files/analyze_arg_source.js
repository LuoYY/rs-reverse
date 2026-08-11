// 分析 op=1842 的 arg0[143] 固定明文 与 arg1[21] 密钥 的来源
// 关键问题：143B 固定数组是否在 _$k0 / _$ez / keys 中？21B 密钥如何派生？
const d = require('./nx_k0_kt_same.json');
const calls = require('./nx_1842_calls.json');
const k0 = d.k0Snap.k0;
const ezBytes = d.k0Snap.ez[1]; // _$ez 字符字节
const kt = d.ktFinal;

// 固定明文（调用#0/#2/#4 的 arg0）
const fixed143 = calls[0].args[0].x;

// 1) 在 _$k0 中搜索 fixed143 的最长匹配
function lcsSub(a, b) {
  // 返回 a 在 b 中最长连续匹配
  let bestLen = 0, bestPos = -1;
  for (let i = 0; i <= b.length - a.length; i++) {
    let l = 0;
    while (l < a.length && b[i + l] === a[l]) l++;
    if (l > bestLen) { bestLen = l; bestPos = i; }
  }
  return { bestLen, bestPos };
}
const m1 = lcsSub(fixed143, k0);
console.log('fixed143 在 _$k0 中: bestLen=' + m1.bestLen + ' @' + m1.bestPos);

// 2) fixed143 是否由 _$k0 索引拼接？检查每个字节是否出现在 k0 中及位置
const k0map = {};
k0.forEach((v, i) => { (k0map[v] = k0map[v] || []).push(i); });
let covered = 0, uncovered = [];
fixed143.forEach((b, i) => { if (k0map[b]) covered++; else uncovered.push(i); });
console.log('fixed143 字节在 k0 中覆盖: ' + covered + '/' + fixed143.length, '未覆盖位置:', uncovered.slice(0, 10));

// 3) fixed143 是否在 _$ez 字节中？
const m2 = lcsSub(fixed143, ezBytes);
console.log('fixed143 在 _$ez 中: bestLen=' + m2.bestLen + ' @' + m2.bestPos);

// 4) arg1[21] 密钥分析：三次调用的密钥
console.log('\n=== arg1[21] 密钥 ===');
calls.forEach((c, i) => {
  const a1 = c.args[1].x;
  console.log('#' + i + ' arg0len=' + c.args[0].x.length + ' key=' + a1.join(','));
});

// 5) 固定明文前 32 字节的 XOR 分析（#0 vs #2 的密钥差异）
const k0c = calls[0].args[1].x;
const k2c = calls[2].args[1].x;
console.log('\nkey#0 ^ key#2:', k0c.map((b, i) => b ^ k2c[i]).join(','));

// 6) fixed143 的前 16 字节是否与 keys2/k0 相关？
console.log('\nfixed143[0:32]:', fixed143.slice(0, 32).join(','));
// 与 kt 中 be 段（[65:]）对比——如果 be 是 AES 加密 fixed143
const be = kt.slice(65);
console.log('kt[65:] (be) len=' + be.length + ' [0:16]:', be.slice(0, 16).join(','));

// 7) 尝试：be 是否 = AES-CBC(fixed143, key=keys2 或 K16)？
// 直接对比关系：xor(be[0:16], fixed143[0:16])
console.log('\nbe[0:16] ^ fixed143[0:16]:', be.slice(0, 16).map((b, i) => b ^ fixed143[i]).join(','));

// 8) 检查 _$k0 中的 AES S-box 相关常量是否程序化
console.log('\n=== _$k0 结构抽查 ===');
[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].forEach(i => console.log('k0[' + i + ']=' + k0[i]));
