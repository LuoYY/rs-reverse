// 分析 _$mD[615] 调用的写入模式：ez/pl 与 _$kt 变化
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_mD_calls.json');
console.log('总调用数:', calls.length);

// 每轮调用（_$kt 重置检测）
let round = 0;
let prevLen = -1;
console.log('\n=== 每轮调用（ez/pl/before len/after len/写入位置） ===');
calls.forEach((c, i) => {
  const bl = c.before ? c.before.length : 0;
  const al = c.after ? c.after.length : 0;
  // 检测重置（after len < before len 或 before=0 after>0 且数组重新开始）
  const reset = bl === 0 || al < bl;
  if (reset && i > 0) round++;
  // 找写入的差异位置
  let diff = 'none';
  if (c.before && c.after) {
    const changes = [];
    const max = Math.max(bl, al);
    for (let j = 0; j < max; j++) {
      if (c.before[j] !== c.after[j]) changes.push('#' + j + '=' + c.after[j]);
    }
    diff = changes.slice(0, 12).join(' ');
  }
  console.log('#' + i + ' r' + round + ' ez=' + c.ez + ' pl=' + c.pl + ' len:' + bl + '→' + al + (reset ? ' [重置]' : '') + ' 写: ' + diff);
});
