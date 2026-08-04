const fs = require('fs');
const saved = JSON.parse(fs.readFileSync('/tmp/nx_browser_scripts.json', 'utf8'));
const browserDyn = saved.find(s => s.len === 386955);
const sandboxDyn = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
if (!browserDyn) { console.log('未找到浏览器 dynCode'); process.exit(1); }
console.log('浏览器 dyn len:', browserDyn.source.length);
console.log('沙箱 dyn len:', sandboxDyn.length);
// 找首个差异位置
let diff = -1;
for (let i = 0; i < Math.min(browserDyn.source.length, sandboxDyn.length); i++) {
  if (browserDyn.source[i] !== sandboxDyn[i]) { diff = i; break; }
}
console.log('首个差异:', diff);
if (diff > 0) {
  console.log('浏览器:', browserDyn.source.substring(Math.max(0, diff - 80), diff + 120));
  console.log('沙箱:', sandboxDyn.substring(Math.max(0, diff - 80), diff + 120));
}
// 统计差异：长度差 167，找出尾部差异
console.log('\n浏览器尾部:', browserDyn.source.substring(browserDyn.source.length - 200));
console.log('\n沙箱尾部:', sandboxDyn.substring(sandboxDyn.length - 200));
// 检查 browserDyn 是否含 _$lf/_$eF
for (const v of ['_$lf', '_$eF', '_$pk', '_$h7', '_$b1', '_$oV']) {
  console.log(`浏览器含 ${v}:`, browserDyn.source.includes(v), '沙箱含:', sandboxDyn.includes(v));
}
