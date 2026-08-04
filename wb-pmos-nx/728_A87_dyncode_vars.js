const fs = require('fs');
const saved = JSON.parse(fs.readFileSync('/tmp/nx_browser_scripts.json', 'utf8'));
const browserDyn = saved.find(s => s.len === 386955);
const sandboxDyn = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 提取所有混淆变量名（_$xx 模式）
function extractVars(code) {
  const vars = new Set();
  const re = /_\$[a-zA-Z0-9_$]+/g;
  let m;
  while ((m = re.exec(code)) !== null) vars.add(m[0]);
  return [...vars].sort();
}
const bVars = extractVars(browserDyn.source);
const sVars = extractVars(sandboxDyn);
console.log('浏览器变量数:', bVars.length, '沙箱变量数:', sVars.length);
// 差异变量
const onlyB = bVars.filter(v => !sVars.includes(v));
const onlyS = sVars.filter(v => !bVars.includes(v));
console.log('仅浏览器有:', onlyB.slice(0, 30).join(','));
console.log('仅沙箱有:', onlyS.slice(0, 30).join(','));
// 相同变量
const common = bVars.filter(v => sVars.includes(v));
console.log('共有:', common.slice(0, 30).join(','));
// 计算：如果变量名一一对应（同位置替换），则结构相同
console.log('\n浏览器变量样本:', bVars.slice(0, 20).join(','));
console.log('沙箱变量样本:', sVars.slice(0, 20).join(','));
