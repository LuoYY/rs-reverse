// 对比不同会话的 base（本地固定 vs 真实代理）找生成规律
// 关键：base 哪些字节跨会话恒定（模板），哪些随 keys/时间戳变
const ktBase = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_base_from_kt.json'); // 本地固定（时间戳 521019862）
const env = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_env_samples.json'); // 真实代理 4 样本

console.log('本地固定 base len:', ktBase.length, 'head:', ktBase.slice(0, 8).join(','));
env.forEach((s, i) => {
  console.log('#' + i + ' 真实 base len:', s.base.length, 'head:', s.base.slice(0, 8).join(','));
});

// 关键：base 头对比
console.log('\n=== base 头对比 ===');
console.log('本地固定 [0:22]:', ktBase.slice(0, 22).join(','));
env.forEach((s, i) => {
  console.log('#' + i + ' [0:22]:', s.base.slice(0, 22).join(','));
});

// 本地固定 base 尾部
console.log('\n本地固定 base 尾部 40:', ktBase.slice(-40).join(','));
env.forEach((s, i) => {
  console.log('#' + i + ' 尾部 40:', s.base.slice(-40).join(','));
});
