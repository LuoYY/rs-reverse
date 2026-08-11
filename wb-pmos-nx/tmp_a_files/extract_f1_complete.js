// 提取完整 _$f1 构建（@87981 附近的完整语句）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 从 _$f1[34]= 开始，提取到语句结束（找到下一个 function 或 return 前的完整表达式）
const start = c.indexOf('_$f1[34]=');
console.log('开始 @' + start);
// 提取到 _\$f1 相关语句结束（找 "function" 或分号后的函数定义）
let seg = c.slice(start, start + 3000);
// 匹配所有 _$f1[N]=X 或 _$f1[N]=_$f1[M]=X
const re = /_\$f1\[(\d+)\]=_\$f1\[(\d+)\]=([_$a-zA-Z0-9]+)|_\$f1\[(\d+)\]=([_$a-zA-Z0-9]+)/g;
const map = {};
let m;
while ((m = re.exec(seg)) !== null) {
  if (m[3]) { map[+m[1]] = m[3]; map[+m[2]] = m[3]; }
  else if (m[5]) map[+m[4]] = m[5];
}
console.log('完整 _$f1 条目:', Object.keys(map).length);
Object.entries(map).sort((a, b) => a[0] - b[0]).forEach(([op, fn]) => console.log('  op=' + op + ' → ' + fn));
// 保存
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_f1_map_full.json', JSON.stringify(map, null, 1));
// 打印原始段（找是否有更多 _$f1 赋值在别处）
console.log('\n=== 原始段前 2000 ===');
console.log(seg.slice(0, 2000));
