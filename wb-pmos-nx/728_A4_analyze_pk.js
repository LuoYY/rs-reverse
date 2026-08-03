const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 搜索 _$pk 的构造/赋值
let idx = 0; const occ = [];
while ((idx = code.indexOf('_$pk', idx + 1)) !== -1 && occ.length < 50) occ.push(idx);
console.log('_$pk 出现前50:', occ.join(','));
// 找第一个赋值（_$pk= 或 ._$pk= 或 var _$pk）
const assignIdx = code.search(/_[$]\w*_$pk\s*=/);
console.log('_$pk= 赋值位置:', assignIdx);
const varIdx = code.indexOf('var _$pk');
console.log('var _$pk:', varIdx);
// 打印 _$pk 相关模式：push、concat、构造函数
for (const pat of ['_$pk.push', '_$pk=', '._$pk', 'for(', 'Object.getOwnPropertyNames', 'Object.keys', 'for in']) {
  const i = code.indexOf(pat);
  console.log(`--- 模式 ${pat} @${i} ---`);
  if (i >= 0) console.log(code.substring(Math.max(0, i - 250), i + 250));
}
