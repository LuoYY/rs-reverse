// 分析 _$kt 写入轨迹：每个位置的写入值变化
// 关键：找到 59,148,7,120（base 头）何时出现
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
console.log('写入记录数:', writes.length);

// 找 base 头 59,148,7,120 首次出现
let found = false;
writes.forEach((w, i) => {
  if (!found && w.kt && w.kt[0] === 59 && w.kt[1] === 148) {
    console.log('★ base 头(59,148) @记录#' + i + ' cV=' + w.cV);
    console.log('  kt:', w.kt.slice(0, 30).join(','));
    found = true;
  }
});
if (!found) console.log('未找到 59,148 头');

// 找 179 头（浏览器版）
writes.forEach((w, i) => {
  if (w.kt && w.kt[0] === 179 && w.kt[1] === 0) {
    console.log('179 头 @记录#' + i + ' cV=' + w.cV);
    console.log('  kt:', w.kt.slice(0, 20).join(','));
  }
});

// 分析第一个数组（len 增长过程）的写入模式
console.log('\n=== 首 30 条写入记录（cV + kt 前 12） ===');
writes.slice(0, 30).forEach((w, i) => {
  console.log('#' + i + ' cV=' + w.cV + ' kt=' + (w.kt ? w.kt.slice(0, 12).join(',') : 'null'));
});
