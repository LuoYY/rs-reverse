// 从 _$c4 源码提取 op=265 分支完整语义 + 编码函数调用点
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');

// 1. op=265 分支
const re = /_\$pW===265\)\{(.{0,2000}?)\}/s;
const m = c4.match(re);
console.log('=== op=265 分支源码 ===');
if (m) console.log(m[1].slice(0, 2000));
else console.log('未找到 ===265 分支，尝试其他模式');
// 找所有 265 出现位置
let idx = 0, n = 0;
while ((idx = c4.indexOf('265', idx)) >= 0) {
  const ctx = c4.slice(Math.max(0, idx - 60), Math.min(c4.length, idx + 80));
  if (ctx.includes('===') || ctx.includes('_$pW') || ctx.includes('_$bk') || ctx.includes('_$hB')) {
    console.log('--- 265 @' + idx + ' ---');
    console.log(ctx.replace(/\n/g, ' '));
    if (++n > 12) break;
  }
  idx += 3;
}
