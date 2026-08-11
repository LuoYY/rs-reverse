const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_op13_local_patched.js', 'utf8');
// 找主循环 while(1){...} 结构
const m = code.match(/while\(1\)\{([^]{0,200})/);
console.log('主循环开头:', m ? m[1] : 'none');
// 找所有数组索引写入模式：_$X[_$Y[i]]=
const writes = code.match(/if\(_\$pW===\d+\)\{[^}]*\[[^}]*\[[0-9]+\]\]=[^}]*;/g);
console.log('\n数组索引写入 opcode 数:', writes ? writes.length : 0);
if (writes) writes.slice(0, 20).forEach((w, i) => console.log(i, w.slice(0, 80)));
// 找 push
const pushes = code.match(/if\(_\$pW===\d+\)\{[^}]*\.push\([^}]*;/g);
console.log('\npush opcode 数:', pushes ? pushes.length : 0);
if (pushes) pushes.slice(0, 20).forEach((w, i) => console.log(i, w.slice(0, 80)));
