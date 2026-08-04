/**
 * 756_fixed_cd_diff_analysis.js
 * 分析固定 nsd/cd 下多次加载的 base 具体差异位置
 * 需要修改 755 保存 3 个 base 到 /tmp/nx_755_results.json
 */
const d = JSON.parse(require('fs').readFileSync('/tmp/nx_755_results.json', 'utf8'));
const R = d.results;
console.log('轮次数:', R.length);
R.forEach((r, i) => console.log('R' + i + ': len=' + r.base.length + ' [22-28]=' + r.base.slice(22, 29).join(',') + ' [68:88]=' + r.base.slice(68, 88).join(',') + ' tail8=' + r.base.slice(-8).join(',')));
console.log();
// 逐字节对齐对比（截断到最短）
const minLen = Math.min(...R.map(r => r.base.length));
console.log('=== 差异位置（对齐到最短长度） ===');
const a = R[0].base, b = R[1].base;
const diffA = [], diffB = [];
for (let i = 0; i < minLen; i++) {
  if (a[i] !== b[i]) { diffA.push(i); diffB.push(i); }
}
console.log('R0 vs R1 差异(' + diffA.length + '):', diffA.join(','));
for (const i of diffA) console.log('  [' + i + '] R0=' + a[i] + ' R1=' + b[i]);
console.log();
// 长度差异：谁长？尾部是否多出
console.log('长度: R0=' + a.length + ' R1=' + b.length + ' R2=' + R[2].base.length);
console.log('R1 比 R0 多出的字节(尾部):', b.slice(a.length));
console.log('R2 比 R0 多出的字节(尾部):', R[2].base.slice(a.length));
// 对比 r2mka/startv
console.log();
console.log('r2mka:', R.map(r => r.r2mka.join(',')).join(' | '));
console.log('startv:', R.map(r => r.startv.join(',')).join(' | '));
console.log('keys2 相同:', R.every(r => JSON.stringify(r.keys2) === JSON.stringify(R[0].keys2)));
