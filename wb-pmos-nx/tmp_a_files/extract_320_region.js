const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
// 320 分支 @88854（相对 seg），它属于哪个 while？检查该位置是否仍在 while(3) 范围内
// while(3) 循环体范围：从 0 到 while(4) 定义开始？检查 88854 是否合理
console.log('88854 在 seg 内，绝对位置:', start + 88854);
// 检查 while(3) 的结束（找下一个 while(1){ 定义 var _$oJ,_$pW 的那个）
const w4 = seg.indexOf('_$oJ,_$pW,_$g6=_$cg');
console.log('while(4) 定义 @', start + w4);
// 88854 < w4? 如果是，则 320 分支属于 while(3)
console.log('88854 < w4:', 88854 < w4);
// 打印 320 分支的 else（320-444）
let idx = 88854;
console.log('\n=== 320 分支 @' + (start + idx) + ' ===');
console.log(seg.slice(idx, idx + 1500));
