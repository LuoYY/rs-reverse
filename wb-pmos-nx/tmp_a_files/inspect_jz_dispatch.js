// 检查 _$c4 内层 _$jZ dispatcher 结构
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
// 找 _$jZ 相关分派
console.log('_$jZ 出现次数:', (c4.match(/_$jZ/g) || []).length);
// 找 _$jZ=== 的分派
const m = c4.match(/_$jZ===1584\)\{[^}]*\}/);
console.log('_$jZ===1584:', m ? m[0] : 'N/A');
// 找 _$jZ 的初始分派（类似 if(_$jZ<...)
const jzDispatch = c4.indexOf('_$jZ');
console.log('\n_$jZ 首次出现:', c4.slice(jzDispatch - 100, jzDispatch + 100));
// 找 if(_$jZ 分派树
const re = /if\(_\$jZ<(\d+)\)\{/g;
let mm, found = [];
while ((mm = re.exec(c4)) && found.length < 10) found.push(mm[0]);
console.log('\n_$jZ 分派树:', found.join(' | '));
// 找外层调用 _$c4 传入 _$jZ 的地方
const re2 = /_\$c4\(\d+,.*_\$jZ/g;
const m2 = c4.match(re2);
console.log('\n外层传 _$jZ:', m2 ? m2.slice(0, 5) : 'N/A');
