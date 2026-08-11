// 对比两次 P cookie：确定性测试
const a = require('./nx_p1.json');
const b = require('./nx_p2.json');
console.log('O 相同?', a.O === b.O);
console.log('P 相同?', a.P === b.P);
if (a.P !== b.P) {
  console.log('P1:', a.P.slice(0, 60));
  console.log('P2:', b.P.slice(0, 60));
  // 找差异位置
  const m = Math.min(a.P.length, b.P.length);
  let diff = -1;
  for (let i = 0; i < m; i++) if (a.P[i] !== b.P[i]) { diff = i; break; }
  console.log('首个差异 @', diff);
}
