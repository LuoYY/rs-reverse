/**
 * 670_kE_h1.js
 * 分析 _$kE 的 _​$h1（bytecode）来源 + hook 记录
 */
const fs = require('fs');

const kE = fs.readFileSync('/tmp/nx_dyn__$kE.js', 'utf8');

// 找 _$h1 的赋值（_$h1= 或参数）
const h1Idx = kE.indexOf('_$h1=');
console.log('_$h1= 位置:', h1Idx);
if (h1Idx > 0) console.log('上下文:', kE.substring(h1Idx - 100, h1Idx + 100));

// 找 _$h1 的所有出现
const re = /_\$h1/g;
let m;
const poss = [];
while ((m = re.exec(kE)) !== null) poss.push(m.index);
console.log('_$h1 出现:', poss.length, '前 5:', poss.slice(0, 5).join(','));

// 找函数体里 _$h1 的第一次赋值
for (const pos of poss) {
  const ctx = kE.substring(Math.max(0, pos - 40), pos + 40);
  if (ctx.includes('=') && !ctx.includes('==')) {
    console.log('\n赋值上下文:', ctx);
    break;
  }
}

// 找 _$kE 的参数绑定（函数开头 var 声明）
const head = kE.substring(0, 3000);
console.log('\n=== 函数开头（_$h1 相关）===');
// 找 var 声明里的 _$h1
const varIdx = kE.indexOf('var _$h1');
if (varIdx > 0) console.log('var _$h1 @', varIdx, ':', kE.substring(varIdx, varIdx + 120));

// 参数使用：_$h1 是否 = 某参数
for (const p of ['_$cv', '_$cr', '_$l6', '_$mH', '_$ia']) {
  const idx = kE.indexOf('_$h1=' + p);
  if (idx > 0) console.log(`_$h1=${p} @${idx}`);
}
