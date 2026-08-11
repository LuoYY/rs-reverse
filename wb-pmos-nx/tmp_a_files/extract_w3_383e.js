const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 168107, end = 347085;
const seg = c.slice(start, end);
// while(3) 的 256-444 区：opcode 383 的 handler
// 先找 `_$jc<444` 的 else（>=444 区）之前，即 256-444 区
// 在 seg 中找 `===383` 形式。轨迹显示 opcode 值 383。
// 也可能 handler 是 `_$jc>382` 或嵌套二分。
// 搜索 383 附近：找 '383' 在 handler 区（非数据表）
// 数据表 @247341（相对 79234）。真正的 handler 应该在 168107-347085 内非数据位置
// 用二分：_$jc<444 内 else 是 256-443，其 handler 可能有 `_$jc===383`
// 直接搜 '383){' '383;' '383:' 等
for (const pat of ['383){', '383;', '===383', '==383', '>383', '>=384', '<384']) {
  let i = seg.indexOf(pat);
  let cnt = 0;
  while (i >= 0 && cnt < 5) {
    const abs = start + i;
    // 跳过数据表区（247341 附近）
    if (abs < 240000 || abs > 250000) {
      console.log(pat + ' @' + abs + ': ' + seg.slice(Math.max(0, i - 80), i + 120));
      cnt++;
    }
    i = seg.indexOf(pat, i + 1);
  }
  console.log('---');
}
