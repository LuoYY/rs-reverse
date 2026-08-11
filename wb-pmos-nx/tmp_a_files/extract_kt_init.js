// 提取 _$kt 初始化指令的完整 _$k0 索引序列 + 字面量
// 并对比：快照 snap0 的 kt 值 → 验证映射
const d = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json');
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
const ktFinal = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');

const ins = d.find(x => x.pc === 1527);
const code = ins.code;
// 解析 _$kt=[...] 中的元素：_$k0[N] 或 数字
const body = code.slice(code.indexOf('[') + 1, code.lastIndexOf(']'));
const tokens = body.split(',').map(s => s.trim());
const idxSeq = tokens.map(t => {
  const m = t.match(/_\$k0\[(\d+)\]/);
  if (m) return { type: 'k0', idx: parseInt(m[1]) };
  return { type: 'lit', val: parseInt(t) };
});
console.log('元素数:', idxSeq.length);

// 快照 0 的 kt
const snap0 = writes[0].kt;
console.log('snap0 len:', snap0.length);
console.log('snap0 head[0:65]:', snap0.slice(0, 65).join(','));

// 用索引序列 + 捕获的 _$k0 反推验证：_$k0 必须满足 init[0]=snap0[0]...
// 但 tables_init 是另一会话，我们只验证结构：
// 打印第一个"非连续"处（即 init 序列 vs snap0 长度）
// snap0 可能被截断到 200，也可能初始数组更长
// 验证：init 序列前 N 个元素是否 == snap0（如果 _$k0 与会话匹配）
console.log('\n前 20 个 token:', idxSeq.slice(0, 20).map(t => t.type === 'k0' ? 'k0[' + t.idx + ']' : t.val).join(', '));
console.log('snap0[0:20]:', snap0.slice(0, 20).join(','));
console.log('\n前 65 个 token (idx):', idxSeq.slice(0, 65).map(t => t.type === 'k0' ? t.idx : t.val).join(','));

// 检查初始化数组长度 vs snap0 长度
console.log('\ninit 长度:', idxSeq.length, 'snap0 长度:', snap0.length);
// 如果 init > 200，说明快照截断了；看 init 的元素数是否 >= 209
// 找 init 中位置 63,64,65 的 token（对应 beLen 位置）
[63, 64, 65, 200, 201, 202, 203, 204, 205, 206, 207, 208].forEach(i => {
  if (i < idxSeq.length) {
    const t = idxSeq[i];
    console.log('init[' + i + '] =', t.type === 'k0' ? '_$k0[' + t.idx + ']' : t.val);
  }
});

// 保存索引序列
require('fs').writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_init_idx.json', JSON.stringify(idxSeq));
console.log('\n已保存 nx_kt_init_idx.json');
