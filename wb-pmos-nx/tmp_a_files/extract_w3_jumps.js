const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 168107, end = 347085;
const seg = c.slice(start, end);
// 所有 _$oL 跳转（_$oL+=N 或 _$oL+=-N，含条件形式）
const jumps = seg.match(/_\$oL[\+\-]=[^;]{0,30};/g);
console.log('=== 所有 _$oL 跳转 ===');
console.log(jumps ? jumps.join('\n') : '无');
console.log('\n总数:', jumps ? jumps.length : 0);
// 也搜 _\$oL 增量赋值
const inc = seg.match(/_\$oL\+=-\d+/g);
console.log('\n负跳转:', inc ? [...new Set(inc)].join(' ') : '无');
