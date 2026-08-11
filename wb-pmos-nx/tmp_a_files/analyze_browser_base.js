// agentB 数据集 base 头稳定性 + 完整结构
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

console.log('=== base[0:22] 头稳定性 ===');
const heads = new Set(data.map(s => s.base.slice(0, 22).join(',')));
console.log('不同头数:', heads.size);
if (heads.size === 1) console.log('★ [0:22] 恒定:', data[0].base.slice(0, 22).join(','));
else {
  data.forEach((s, i) => console.log('#' + i, s.nsd, 'head[0:8]=' + s.base.slice(0, 8).join(',')));
}

// 完整结构：取第一个样本分析
console.log('\n=== 样本#0 完整结构 ===');
const s0 = data[0];
console.log('len=' + s0.base.length);
// 分段（用 0 位置 + 已知结构）
console.log('head[0:22]=', s0.base.slice(0, 22).join(','));
console.log('[22:29]=', s0.base.slice(22, 29).join(','));
console.log('[29:68]=', s0.base.slice(29, 68).join(','));
console.log('[68:73]=', s0.base.slice(68, 73).join(','));
console.log('[73:110]=', s0.base.slice(73, 110).join(','));
console.log('[110:137]=', s0.base.slice(110, 137).join(','));
console.log('[137:]=', s0.base.slice(137).join(','));

// 检查块模板在 [75:110] 中的位置
console.log('\n=== 块模板匹配 ===');
const blocks = {
  'A': [76, 0, 25, 10, 171, 221, 218, 233, 234],
  'B': [49, 144, 170, 189, 221, 174, 158, 169],
  'A2': [105, 171, 119, 0, 221, 218, 233, 234],
  'C': [249, 117, 222, 42, 169, 237, 173],
  'D': [77, 158, 17, 7, 119, 143, 23, 17],
  'E': [100, 217, 225, 16, 119, 121, 241, 113],
};
data.forEach((s, i) => {
  const seg = s.base.slice(75, 110);
  const segStr = seg.join(',');
  let found = '?';
  for (const [name, tmpl] of Object.entries(blocks)) {
    if (segStr.includes(tmpl.join(','))) found = name;
  }
  console.log('#' + i, s.nsd, 'block=' + s.block, '检测=' + found);
});
