const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找第二个 function _$kx(（_$b1 的容器，@73876 附近）
const idx2 = code.indexOf('function _$kx(_$aq)');
console.log('function _$kx(_$aq) @', idx2);
console.log('容器头部 800:', code.substring(idx2, idx2 + 800));
// 容器里 _$h7 的赋值：在 idx2 到 _\$b1 定义之间的 _$h7= 和 _$h7[
let depth = 0, started = false, end1 = -1;
for (let i = idx2; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end1 = i; break; } }
}
console.log('\n容器范围:', idx2, '→', end1, '长度:', end1 - idx2);
const body = code.substring(idx2, end1);
// 容器内所有 _$h7 引用
let i = 0; const h7 = [];
while ((i = body.indexOf('_$h7', i + 1)) !== -1 && h7.length < 30) h7.push(i);
console.log('容器内 _$h7 引用:', h7.join(','));
for (const pos of h7) {
  console.log(`--- @${idx2 + pos} ---`);
  console.log(body.substring(Math.max(0, pos - 200), pos + 250));
  console.log();
}
