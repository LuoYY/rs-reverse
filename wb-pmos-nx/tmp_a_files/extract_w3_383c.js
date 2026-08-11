const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
// while(3) 区域：从 start 到 while(4) 定义（_$oJ,_$pW,_$g6=_$cg）
const w4def = c.indexOf('var _$oJ,_$pW,_$g6=_$cg', start);
console.log('while(3) @' + start + ' while(4) @' + w4def + ' 长度 ' + (w4def - start));
const seg = c.slice(start, w4def);
// 所有 _$oL 跳转
const jumps = seg.match(/_ \$oL[+=-][^;]{0,25};/g);
console.log('\n=== 所有 _$oL 跳转 ===');
console.log(jumps ? jumps.join('\n') : '无');
// 383 上下文
let i = seg.indexOf('383');
console.log('\n=== 383 出现 ===');
while (i >= 0) {
  console.log('@' + (start + i) + ': ' + seg.slice(Math.max(0, i - 60), i + 80));
  i = seg.indexOf('383', i + 3);
  if (i > 300000) break;
}
