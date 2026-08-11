// 找 _$aN / _\$\$N / _$a8 定义
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');
for (const name of ['_$aN', '_$$N', '_$a8', '_$oN']) {
  let i = c.indexOf('function ' + name + '(');
  if (i >= 0) {
    let depth = 0, end = -1;
    for (let j = i; j < c.length; j++) {
      if (c[j] === '{') depth++;
      else if (c[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    console.log('=== ' + name + ' ===');
    console.log(c.slice(i, end + 1).slice(0, 400));
  } else {
    // 找赋值形式
    i = c.indexOf(name + '=');
    if (i >= 0) console.log('=== ' + name + ' (assign) ===\n' + c.slice(i, i + 150));
    else console.log(name + ': 未找到');
  }
  console.log();
}
// 找 _\$\$N 的所有赋值
let idx = 0, cnt = 0;
while ((idx = c.indexOf('_$$N=', idx)) >= 0 && cnt < 5) {
  console.log('_$$N= @' + idx + ': ' + c.slice(idx, idx + 80));
  idx += 5; cnt++;
}
// 找 _$aN= 赋值
idx = 0; cnt = 0;
while ((idx = c.indexOf('_$aN=', idx)) >= 0 && cnt < 5) {
  console.log('_$aN= @' + idx + ': ' + c.slice(idx, idx + 80));
  idx += 5; cnt++;
}
