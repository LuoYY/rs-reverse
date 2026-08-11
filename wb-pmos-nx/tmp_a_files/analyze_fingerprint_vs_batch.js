// 判断 [22:78] 的变化：指纹组内恒定（模板）还是会话（组内也变）？
// 样本 #0/#2 同批次（b60/b65=0/140），对比它们的 [22:78]
const samples = require('./nx_env_samples.json');
console.log('样本批次: #0=0/140 #1=186/1 #2=0/140 #3=181/59');
console.log('#0 len=' + samples[0].base.length + ' #2 len=' + samples[2].base.length);

// 同批次 #0 vs #2 对比（len 167 vs 166）
console.log('\n=== 同批次 #0 vs #2 差异位置 ===');
const a = samples[0].base, b = samples[2].base;
const m = Math.min(a.length, b.length);
let diffs = [];
for (let i = 0; i < m; i++) if (a[i] !== b[i]) diffs.push(i);
console.log('差异位置:', diffs.join(','));
console.log('差异数:', diffs.length);

// 同批次内 [0:70] 恒定？（指纹组内）
console.log('\n=== #0 vs #2 [0:70] 对比 ===');
for (let i = 0; i < 70; i++) {
  if (a[i] !== b[i]) console.log('[' + i + '] #0=' + a[i] + ' #2=' + b[i]);
}
console.log('([0:70] 未列出=同批次内恒定)');

// [70:len-40] 中间段
console.log('\n=== #0 vs #2 [70:len-40] ===');
console.log('#0: ' + a.slice(70, a.length - 40).join(','));
console.log('#2: ' + b.slice(70, b.length - 40).join(','));
