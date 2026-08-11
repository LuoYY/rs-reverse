const d = require('./nx_pools_same.json');
console.log('_$_L[116] =', JSON.stringify(d.pools._L[116]));
// _$a2 是 window，window.create 是什么？buildEnv 无此属性
// 看 sdenv 中 window 的属性
console.log('\n_$c7 应该是 window[_$_L[116]]');
// 也查 _\$oP[113] = "String" → _$c3 = window.String
// 查 _\$a2 在 buildEnv 的 window 是否有这些属性
const c = require('fs').readFileSync('./nx_dynCode_full_patched.js', 'utf8');
// op386 上下文
let i = c.indexOf('_$jc===386){', 168107);
console.log('\nop386:');
console.log(i >= 0 ? c.slice(i, i + 150) : '未找到');
