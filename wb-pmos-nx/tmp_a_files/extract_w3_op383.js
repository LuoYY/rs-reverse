// 精确提取 while(3) 中 op383 分支代码（二分树结构）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
// while(3) 结构：if(_$jc<444){if(_$jc<256){...}else{...<256-444>...}}else{...}
// op383 在 256-444 区。找 _$jc<256 的 else 块
const seg = c.slice(start, start + 90000);
// 找第一个 '_$jc<256){' 对应的 else
const i256 = seg.indexOf('_$jc<256){');
console.log('_$jc<256 @' + i256);
// 从 i256 之后找 else{（对应 256-444 区）
const after = seg.slice(i256);
// 256-444 区内的 383 处理：383 不在二分树顶部，可能通过嵌套。搜索 '_$jc>=' 阈值
const ge = seg.match(/_ \$jc>=256/g);
console.log('_$jc>=256 出现:', ge ? ge.length : 0);

// 直接搜索 op383 处理：常见形式 _$jc===383 或 else if 链
// 打印整个 256-444 区（可能很长，分段打印关键部分）
const j443 = seg.indexOf('_$jc>=444');
console.log('_$jc>=444 @' + j443);
// 打印 383 处理：在 256-444 区内找 '_$jc>' 判断
// 先找嵌套二分：_$jc<330 等
const bounds = seg.match(/_ \$jc<(\d+)\)/g);
console.log('二分阈值:', bounds ? [...new Set(bounds)].join(' ') : '无');
