// 决定性验证：浏览器 base179 的 [22:29] 与 [68:73] 配对实验
// 同会话采集 base179（真实代理 sdenv 生成 59 头？或浏览器？）
// 用 agentB 的 verify_dataset 数据：组1 内两样本 [22:25] 互换，测服务器
// 但这是静态数据无法测服务器。改为：分析配对结构。
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// 关键：检查 agentB 802/804 实验的配对逻辑
// [22:29] 单独改 412 / 一起改 [68:73] 200
// 说明 [22:29] 与 [68:73] 有数学关系

// 检查 [22:29] 与 [68:73] 是否 = 同一函数的输出（分段）
console.log('=== [22:29] vs [68:73] 结构对照 ===');
data.slice(0, 15).forEach((s, i) => {
  console.log('#' + i, 'nsd=' + s.nsd,
    '[22:29]=' + s.base.slice(22, 29).join(','),
    '[68:73]=' + s.base.slice(68, 73).join(','));
});

// 假设：base 是 numarrJoin 结构，[22:29] 和 [68:73] 是其中两个段
// 段1 = 会话数据（含时间戳），段2 = 校验（校验段1）
// 检查 [68:73] 前 2 字节是否 = 长度，后 3 字节是否 = f(段1)
console.log('\n=== [68:73] 结构分析 ===');
data.slice(0, 15).forEach((s, i) => {
  const p22 = s.base.slice(22, 29);
  const e73 = s.base.slice(68, 73);
  const tail5 = p22.slice(2); // [24:29]
  // 尝试 e73 是否与 tail5 相关
  const rel = e73.map((v, j) => v ^ (tail5[j] || 0));
  console.log('#' + i, '[24:29]=' + tail5.join(','), '[68:73]=' + e73.join(','), 'XOR=' + rel.join(','));
});
