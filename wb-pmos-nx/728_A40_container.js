const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// _\$b1 @75498 的容器大函数起始 { @73883。往前找 function 定义
// 从 73883 往前找最近的 "function"
const pre = code.substring(0, 73883);
const fnIdx = pre.lastIndexOf('function');
console.log('容器 function @', fnIdx);
console.log('容器头 500:', code.substring(fnIdx, fnIdx + 500));
// 容器函数完整定义（大到 _\$b1 之后）
let depth = 0, started = false, end1 = -1;
for (let i = fnIdx; i < code.length; i++) {
  const c = code[i];
  if (c === '{') { depth++; started = true; }
  else if (c === '}') { depth--; if (started && depth === 0) { end1 = i; break; } }
}
console.log('容器范围:', fnIdx, '→', end1, '长度:', end1 - fnIdx);
// 容器内 _\$h7 的赋值（不精确但搜索容器内 _\$h7= 和 _\$h7[ 的写入）
const body = code.substring(fnIdx, Math.min(code.length, fnIdx + 200000));
let i = 0; const h7 = [];
while ((i = body.indexOf('_$h7', i + 1)) !== -1 && h7.length < 30) h7.push(i);
console.log('容器前 30 个 _$h7 引用:', h7.join(','));
for (const pos of h7.slice(0, 10)) {
  console.log(`--- @${fnIdx + pos} ---`);
  console.log(body.substring(Math.max(0, pos - 150), pos + 200));
  console.log();
}
