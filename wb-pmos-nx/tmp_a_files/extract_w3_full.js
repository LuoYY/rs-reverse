// 提取 while(3) @168107 的完整循环体
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('var _$lj,_$jc,_$oL=_$la,_$ib=_$lP[0];');
console.log('start @' + start);
// 循环从 while(1){_$jc=_$ib[_$oL++]; 开始
const loopStart = c.indexOf('while(1){_$jc=_$ib[_$oL++];', start);
console.log('loopStart @' + loopStart);
// 找循环体结束：嵌套 if-else，找匹配的 } 对应 while(1){
// 结构：while(1){ ... if(...){...}else if(...){...}... else{...}}
// 提取 60000 字符分析
const seg = c.slice(loopStart, loopStart + 60000);
console.log('seg len:', seg.length);
// 打印 op 383 分支（在 >256 区段）
// 二分树结构：_$jc<444 > _$jc<256 > _$jc<64 > ...
// op383 在 256-444 区间：找 _$jc>=256 或嵌套里的逻辑
// 简化：直接打印 op383 相关（找 383 出现的上下文）
let i = seg.indexOf('383');
console.log('\n=== 383 首次出现上下文 ===');
console.log(seg.slice(i - 200, i + 300));
// 找 pc 跳转相关（_$oL+= 或 _$oL-=）
const jumps = seg.match(/_\$oL[\+=-]+[^;]{0,20};/g);
console.log('\n=== _$oL 跳转 ===');
console.log(jumps ? jumps.slice(0, 60).join('\n') : '无');
