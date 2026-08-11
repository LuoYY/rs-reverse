// 分析 JSVMP 字节码解释器的外部依赖
const fs = require('fs');
const interp = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_real_interp.txt', 'utf8');
// 局部变量（函数参数 + var 声明）
const local = new Set(['_$aq', '_$_T', '_$hr', '_$kx', '_$md', '_$hi', '_$pc', '_$oi', '_$ms', '_$_R', '_$fZ', '_$gx', '_$gB', '_$pC', '_$f1', '_$fD', '_$ax', '_$jb', '_$p2']);
// 提取所有 _\$X 引用
const refs = new Set();
const re = /\$([a-zA-Z0-9_$]+)/g;
let m;
while ((m = re.exec(interp))) {
  const name = '$' + m[1];
  if (!local.has(name) && name.length <= 5) refs.add(name);
}
// 过滤掉 JS 关键字/常见
const skip = new Set(['$true', '$false', '$null', '$new', '$var', '$return', '$function', '$this', '$if', '$else', '$for', '$while', '$switch', '$case', '$break', '$typeof', '$in', '$of', '$let', '$const', '$undefined']);
console.log('外部依赖:');
for (const r of [...refs].sort()) {
  if (skip.has(r)) continue;
  console.log('  ' + r);
}
console.log('\n总数:', [...refs].filter(r => !skip.has(r)).length);
