// 提取 _$f1 完整函数表（@87981 附近的赋值代码）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 找 _$f1[34]= 的完整语句（到 ; 结束）
const start = c.indexOf('_$f1[34]=');
console.log('开始 @' + start);
// 提取到分号或上下文结束
const seg = c.slice(start, start + 2500);
// 分割成 _\$f1[N]=fn 形式
const entries = seg.split('_$f1[').slice(1);
const map = {};
for (const e of entries) {
  const m = e.match(/^(\d+)\]=([_$a-zA-Z0-9]+)/);
  if (m) map[+m[1]] = m[2];
}
console.log('函数表条目:', Object.keys(map).length);
Object.entries(map).sort((a, b) => a[0] - b[0]).forEach(([op, fn]) => console.log('  op=' + op + ' → ' + fn));
// 保存
require('fs').writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_f1_map.json', JSON.stringify(map, null, 1));
