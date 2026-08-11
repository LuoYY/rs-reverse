// 精确段差分：28 样本逐字节对比，分类每个位置
// 需要处理长度差异：base len 166-171
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

// 1. 对齐分析：按位置统计每个 index 的值分布
// 但长度不同 → 尾部不对齐。先看 len 分布
const lens = data.map(s => s.base.length);
console.log('len 分布:', lens.join(','));
console.log('len 范围:', Math.min(...lens), '-', Math.max(...lens));

// 2. 前 110 字节（所有样本都有）：逐位置分类
console.log('\n=== 前 110 字节逐位置分类 ===');
const N = 110;
for (let i = 0; i < N; i++) {
  const vals = data.map(s => s.base[i]);
  const uniq = new Set(vals);
  if (uniq.size === 1) continue; // 恒定
  // 统计前 8 个不同值
  const uniqArr = [...uniq];
  const sample = uniqArr.slice(0, 4).join(',');
  if (uniq.size <= 8) console.log('[' + i + '] ' + uniq.size + '值: ' + sample + '...');
  else console.log('[' + i + '] ' + uniq.size + '值(多变): ' + sample + '...');
}

// 3. 尾部对齐分析：len-40 之后（固定尾）
console.log('\n=== 尾部 40B（相对尾部） ===');
const T = 40;
for (let i = 0; i < T; i++) {
  const vals = data.map(s => s.base[s.base.length - T + i]);
  const uniq = new Set(vals);
  if (uniq.size === 1) continue;
  const uniqArr = [...uniq];
  if (uniq.size <= 5) console.log('tail[-' + (T - i) + '] ' + uniq.size + '值: ' + uniqArr.slice(0, 4).join(','));
  else console.log('tail[-' + (T - i) + '] ' + uniq.size + '值(多变)');
}

// 4. 变体区 [110:137]（各样本 len 不同，但 110 是绝对位置）
console.log('\n=== [110:137] 绝对位置 ===');
for (let i = 110; i < 137; i++) {
  const vals = data.map(s => s.base[i]).filter(v => v !== undefined);
  if (!vals.length) break;
  const uniq = new Set(vals);
  if (uniq.size === 1) { continue; }
  const uniqArr = [...uniq];
  if (uniq.size <= 6) console.log('[' + i + '] ' + uniq.size + '值: ' + uniqArr.slice(0, 5).join(','));
  else console.log('[' + i + '] ' + uniq.size + '值(多变)');
}
