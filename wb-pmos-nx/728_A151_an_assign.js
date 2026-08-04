const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 找 _$an 赋值
let idx = 0; const ass = [];
while ((idx = code.indexOf('_$an=', idx + 1)) !== -1 && ass.length < 20) ass.push(idx);
console.log('_$an= 赋值:', ass.join(','));
for (const i of ass.slice(0, 10)) {
  console.log('@' + i + ':', code.substring(Math.max(0, i - 120), i + 120));
  console.log();
}
// PointerEvent 报错点
const pe = code.indexOf('PointerEvent');
console.log('PointerEvent @', pe);
if (pe >= 0) console.log(code.substring(pe - 250, pe + 100));
// _$eF[?] 中 PointerEvent 的索引
// 搜 'PointerEvent' 字符串在属性名池里的位置——属性名池是浏览器采集的
const pools = JSON.parse(require('fs').readFileSync('/tmp/nx_browser_pools2.json', 'utf8'));
for (const [k, v] of Object.entries(pools.pools)) {
  const arr = JSON.parse(v);
  const i = arr.indexOf('PointerEvent');
  if (i >= 0) console.log('池', k, 'PointerEvent @', i);
}
