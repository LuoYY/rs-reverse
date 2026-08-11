// 提取 _$h7 的所有外部依赖（_$k0[N]/_$oU[N]/_$b1[N]/_$lc[N]/_$f$[N]/_$mD[N]/_$np/_$f3/_$cD 等）
const fs = require('fs');
const fn = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/fn__$h7.txt', 'utf8');

// 收集所有 _\$X[N] 引用（X ∈ {k0,oU,b1,lc,f$,mD,ll,_L,q,_3,M,lC,oP}）
const deps = {};
for (const v of ['k0', 'oU', 'b1', 'lc', 'f$', 'll', '_L', 'q', '_3', 'M', 'lC', 'oP', 'mD', 'np', 'f3', 'f1']) {
  deps['_$' + v] = new Set();
}
// 匹配 _\$XXX[\d+]
const re = /\$(\w+)\[(\d+)\]/g;
let m;
while ((m = re.exec(fn))) {
  const key = '_$' + m[1];
  if (deps[key]) deps[key].add(+m[2]);
}
// 非数组引用（_$np[_$aq] 等变量索引）
for (const v of ['np', 'f3', 'f1', 'cD', 'gL', 'ie', 'mT']) {
  if (fn.includes('_$' + v)) console.log('引用 _$' + v + ': 是');
}
console.log('=== 数组依赖 ===');
for (const [k, s] of Object.entries(deps)) {
  if (s.size) console.log(k + ': [' + [...s].sort((a, b) => a - b).join(',') + ']');
}
// 检查 _$f3 赋值（_$hr() 内 _$f3[_$aq]&_$k0[15] 等）
console.log('\n=== _$f3 相关 ===');
const f3idx = fn.indexOf('_$f3');
console.log(fn.slice(Math.max(0, f3idx - 100), f3idx + 200));
// _$np 相关
const npIdx = fn.indexOf('_$np');
console.log('\n=== _$np 相关 ===');
console.log(fn.slice(Math.max(0, npIdx - 100), npIdx + 200));
