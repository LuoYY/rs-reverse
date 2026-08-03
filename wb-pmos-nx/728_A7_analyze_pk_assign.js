const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$pk=', idx + 1)) !== -1 && ass.length < 30) ass.push(idx);
console.log('_$pk= 赋值:', ass.join(','));
for (const i of ass) {
  console.log(`--- _$pk= @${i} ---`);
  console.log(code.substring(Math.max(0, i - 350), i + 350));
  console.log();
}
// 找 _$pI 构造源头：搜索 window/document/navigator 等环境对象如何进入 VM
for (const pat of ['_$pI=window', '_$pI=document', '_$pI=navigator', '_$pI=_$c_', '_$pI=window.', '_$pI=document.']) {
  const i = code.indexOf(pat);
  console.log(`--- 模式 ${pat} @${i} ---`);
  if (i >= 0) console.log(code.substring(Math.max(0, i - 300), i + 300));
}
// 搜索 '$ts' 或 aebi/scj 传参入口
const tailIdx = code.indexOf('})(_$ts.scj,$_ts.aebi)');
console.log('\ntail IIFE @', tailIdx);
console.log(code.substring(tailIdx - 100, tailIdx + 100));
