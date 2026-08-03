const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 搜索各常量池定义：_$eF= _$l5= _$nL= _$bu= _$dn= _$nb= _$iQ= _$oV= _$kd= _$pk=
for (const name of ['_$eF', '_$l5', '_$nL', '_$bu', '_$dn', '_$nb', '_$iQ', '_$oV', '_$kd', '_$pk', '_$lj', '_$lf']) {
  const i = code.indexOf(name + '=');
  const vi = code.indexOf('var ' + name);
  console.log(`${name}= @${i}  var@${vi}`);
  if (i >= 0) console.log('  ', code.substring(Math.max(0, i - 120), i + 400).replace(/\n/g, ' ').substring(0, 500));
  console.log();
}
