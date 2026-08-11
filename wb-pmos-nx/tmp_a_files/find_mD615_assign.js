// 找 _$mD 数组的填充方式 + [615] 位置的函数
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_dynCode_captured_2.js', 'utf8');

// _$mD 的所有赋值
let idx = 0, n = 0;
while ((idx = c.indexOf('_$mD[', idx)) >= 0 && n < 40) {
  const ctx = c.slice(Math.max(0, idx - 20), Math.min(c.length, idx + 60));
  if (ctx.includes('615') || ctx.includes('=function') || ctx.includes('=new') || ctx.includes('=Array')) {
    console.log('@' + idx + ': ' + ctx.replace(/\n/g, ' '));
    n++;
  }
  idx += 5;
}
// _$mD=[ 数组字面量？
idx = c.indexOf('_$mD=[');
console.log('\n_$mD=[ @' + idx + ': ' + (idx >= 0 ? c.slice(idx, idx + 300) : 'N/A'));
// _$mD.push
idx = c.indexOf('_$mD.push');
console.log('_$mD.push @' + idx + ': ' + (idx >= 0 ? c.slice(idx - 50, idx + 80) : 'N/A'));
// 找函数池构建函数（_$fN 等）
idx = c.indexOf('_$mD=[]');
console.log('_$mD=[] @' + idx + ': ' + (idx >= 0 ? c.slice(idx - 100, idx + 150) : 'N/A'));
