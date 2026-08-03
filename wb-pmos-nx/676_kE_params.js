/**
 * 676_kE_params.js
 * 分析当前 dynCode 的 _$kE（核心解释器）参数 + _$h1 来源
 * 找 basearr 子程序的 bytecode 入口
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_eval_h1.js', 'utf8');
console.log('dynCode len:', code.length);

// 找 _$kE 定义
const kEIdx = code.indexOf('function _$kE(');
console.log('_$kE @', kEIdx);
if (kEIdx > 0) {
  const openBrace = code.indexOf('{', kEIdx);
  let stack = 0, end = -1;
  for (let i = openBrace; i < code.length; i++) {
    if (code[i] === '{') stack++;
    else if (code[i] === '}') { stack--; if (stack === 0) { end = i; break; } }
  }
  const kE = code.substring(kEIdx, end + 1);
  console.log('_$kE 体长:', kE.length);
  fs.writeFileSync('/tmp/nx_dyn_kE_cur.js', kE);
  // 参数
  console.log('参数:', kE.substring(0, 200));
  // 找 _$h1 在 _$kE 内的定义
  const h1Idx = kE.indexOf('_$h1');
  if (h1Idx > 0) console.log('_$h1 @', h1Idx, ':', kE.substring(h1Idx - 60, h1Idx + 60));
  // 找 var 声明
  const varIdx = kE.indexOf('var _$h1');
  console.log('var _$h1:', varIdx);
  // 找 _$oX（指令指针）
  const oXIdx = kE.indexOf('_$oX');
  console.log('_$oX @', oXIdx, ':', kE.substring(Math.max(0, oXIdx - 30), oXIdx + 60));
  // 找 _$kE 主循环
  const whileIdx = kE.lastIndexOf('while(1){');
  console.log('主 while @', whileIdx);
}

// 找 _$bx（bytecode 池，@391897 _$h1=_$bx[15]）
const bxIdx = code.indexOf('_$bx');
console.log('\n_$bx @', bxIdx);
if (bxIdx > 0) console.log('上下文:', code.substring(Math.max(0, bxIdx - 50), bxIdx + 200));

// 找 _$ml 的调用（trampoline 子程序入口）
const mlCalls = code.match(/_\$ml\(\d+/g);
console.log('\n_$ml(N) 调用数:', mlCalls ? mlCalls.length : 0);

// 找 basearr 相关（_$pg trampoline + _$$p[103]）
const pgIdx = code.indexOf('_$pg');
const ppIdx = code.indexOf('_$$p[');
console.log('\n_$pg @', pgIdx, '_$$p[ @', ppIdx);
