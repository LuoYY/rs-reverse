const fs = require('fs');
const a = fs.readFileSync('/tmp/nx_appjs_dyn_2.js', 'utf8'); // jsdom 捕获
const b = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8'); // vm 捕获
console.log('jsdom dyn len:', a.length);
console.log('vm dyn len:', b.length);
// 头部对比
console.log('\njsdom head:', a.substring(0, 300));
console.log('\nvm head:', b.substring(0, 300));
// 找差异位置
let diff = -1;
for (let i = 0; i < Math.min(a.length, b.length); i++) {
  if (a[i] !== b[i]) { diff = i; break; }
}
console.log('\n首个差异位置:', diff);
if (diff > 0) {
  console.log('jsdom:', a.substring(Math.max(0, diff - 100), diff + 100));
  console.log('vm:', b.substring(Math.max(0, diff - 100), diff + 100));
}
// 是否 vm 版本含 while 插桩（__w1/__all）
console.log('\njsdom 含 __all:', a.includes('__all'));
console.log('vm 含 __all:', b.includes('__all'));
console.log('jsdom 含 __w1:', a.includes('__w1'));
console.log('vm 含 __w1:', b.includes('__w1'));
// 尾部对比
console.log('\njsdom tail:', a.substring(a.length - 150));
console.log('vm tail:', b.substring(b.length - 150));
