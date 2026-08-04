// 分析 sdenv cookie 的确定性：同 nsd 两次生成对比
// 目标：找出 cookie 中的稳定段（结构/算法）vs 变化段（随机）
const nx = require('./nx_client');
(async () => {
  console.log('=== sdenv cookie 确定性分析 ===');
  const ctx1 = await nx.init({ log: () => {} });
  const ctx2 = await nx.init({ log: () => {} });
  console.log('nsd1:', ctx1.nsd, 'nsd2:', ctx2.nsd);
  console.log('keys2 相同:', Buffer.from(ctx1.keys2).toString('hex') === Buffer.from(ctx2.keys2).toString('hex'));
  console.log('keys17 相同:', Buffer.from(ctx1.keys17).toString('hex') === Buffer.from(ctx2.keys17).toString('hex'));
  console.log('\ncookie1:', ctx1.cookie);
  console.log('\ncookie2:', ctx2.cookie);
  console.log('\ncookie1 len:', ctx1.cookie.length, 'cookie2 len:', ctx2.cookie.length);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
