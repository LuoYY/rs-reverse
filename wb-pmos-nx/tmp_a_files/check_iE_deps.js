// 检查 _$iE 闭包（jsvmp_iE_closure.js）的外部依赖
const fs = require('fs');
const fn = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_iE_closure.js', 'utf8');
// 闭包内已定义的局部函数
const defined = new Set();
let m;
const reFn = /function (_\$\w+)\(/g;
while ((m = reFn.exec(fn))) defined.add(m[1]);
console.log('闭包内函数:', [...defined].sort().join(', '));
// 所有 _\$X 引用，排除局部函数和参数
const localVars = new Set(['_$iE', '_$aq', '_$k6', '_$hZ', '_$nD', '_$oA', '_$jM', '_$hP', '_$_T', '_$pE', '_$dt', '_$hr', '_$kP', '_$eg', '_$kx', '_$p_', '_$hi', '_$ms', '_$fZ', '_$$m', '_$p2', '_$$6', '_$iR', '_$cS', '_$er', '_$ce', '_$fD', '_$ax', '_$jb', '_$pc', '_$oi', '_$f1', '_$gB', '_$pC', '_$gx', '_$f2', '_$n6', '_$md', '_$fX', '_$kp']);
const refs = new Set();
const re = /\$([a-zA-Z0-9_$]+)/g;
while ((m = re.exec(fn))) {
  const name = '$' + m[1];
  if (!defined.has(name) && !localVars.has(name)) refs.add(name);
}
console.log('\n外部依赖（非局部非定义）:');
console.log([...refs].sort().join(', '));
