const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
// 轨迹顺序（pc:op）：608:225, 609:0, 610:205, 611:388, 612:423, 613:386, 614:119, 615:337, 616:86, 617:410, 618:31, 619:383
// 死循环：619(383) 后跳回 596(69)。即 383 分支执行了 _$oL+=(-23) 或类似
// 找 op383 处理：搜索 '_$jc===383' 没有，用阈值结构定位
// 二分树：_$jc<444 > _$jc<256 else 区 = 256-444
// 256-444 区内的 383 处理。先找这个区的完整文本
// 找 '<444' 的 else（256-444 区起点）
let i444 = seg.indexOf('_$jc<444){');
// 在 seg 中找 '_$jc<256){' 的 else 块开始
let i256 = seg.indexOf('_$jc<256){');
console.log('i256=' + i256, 'i444=' + i444);
// 打印 256-444 区内所有 if 阈值
// 直接从 i256 后找平衡括号，确定 256 else 块边界
// 简化：搜索 383 对应的处理模式（在 256-444 区，383 通常会有 _\$oL+= 或赋值）
// 打印 256-444 区的全部内容（分块）
const region = seg.slice(i256 + 10);
// 383 的二分位置：<444 区且 >256。搜索 '_$jc<384)' 或 '_$jc>383'
for (const t of [256, 320, 384, 400, 420, 440]) {
  let idx = seg.indexOf('_$jc<' + t + '){');
  console.log('_$jc<' + t + '){ @' + idx);
}
// 找 383 精确：387 前的 if 链。打印 383 处理
// 常见形式：if(_$jc<384){...}else{<383 分支>}
// 打印 383 分支上下文：找 '<384' 或 '>383'
for (const t of ['384', '383']) {
  let idx = seg.indexOf('_$jc<' + t + '){');
  if (idx >= 0) {
    console.log('\n=== _$jc<' + t + '){ @' + (start + idx) + ' ===');
    console.log(seg.slice(idx, idx + 700));
  }
}
