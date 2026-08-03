/** 432 分析环境检测调度函数（_$dy 类）：定义、调用 ID、函数体结构 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_envtrue.js', 'utf8');
console.log('len:', code.length);

// 1. 找 _dy 定义与调用
for (const name of ['_$dy', '_$dL', '_$pz']) {
  const defIdx = code.indexOf('function ' + name + '(');
  if (defIdx >= 0) {
    const open = code.indexOf('{', defIdx);
    let stack = 0, end = -1;
    for (let i = open; i < code.length; i++) {
      if (code[i] === '{') stack++;
      else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
    }
    console.log('\n' + name + ': function 定义 @' + defIdx + ', 体 ' + (end - defIdx) + ' chars');
  } else {
    // 赋值形式 _$dy=function(
    const aIdx = code.indexOf(name + '=function(');
    if (aIdx >= 0) {
      const open = code.indexOf('{', aIdx);
      let stack = 0, end = -1;
      for (let i = open; i < code.length; i++) {
        if (code[i] === '{') stack++;
        else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
      }
      console.log('\n' + name + ': 赋值定义 @' + aIdx + ', 体 ' + (end - aIdx) + ' chars');
    } else {
      console.log('\n' + name + ': 未找到定义');
    }
  }
  // 调用 ID 统计
  const ids = {};
  let idx = 0;
  while ((idx = code.indexOf(name + '(', idx)) !== -1) {
    const after = code.substring(idx + name.length + 1, idx + name.length + 20);
    const numM = after.match(/^(\d+)/);
    if (numM) ids[numM[1]] = (ids[numM[1]] || 0) + 1;
    idx += name.length + 1;
  }
  console.log(name + ' 调用 ID:', JSON.stringify(ids));
}
