/**
 * 685_static_bytecode.js
 * 静态分析 /tmp/nx_dyn_cur.js：找 _$_K 调用 + bytecode（_$kN）来源
 * 目标：提取 basearr 子程序的 bytecode 序列
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyn_cur.js', 'utf8');
console.log('dynCode len:', code.length);

// 1. 找 _$_K( 调用（basearr 构造）
const kIdx = code.indexOf('_$_K(');
console.log('\n_$_K( 调用 @', kIdx);
let idx = 0, count = 0;
while ((idx = code.indexOf('_$_K(', idx)) !== -1) {
  count++;
  if (count <= 8) console.log(`  @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 60)}`);
  idx += 5;
}
console.log('_$_K( 总调用:', count);

// 2. 找 _$kN 的所有出现（bytecode 来源）
let knIdx = 0, knCount = 0;
while ((knIdx = code.indexOf('_$kN', knIdx)) !== -1) {
  knCount++;
  if (knCount <= 15) console.log(`\n_$kN @${knIdx}: ${code.substring(Math.max(0, knIdx - 50), knIdx + 60)}`);
  knIdx += 4;
}
console.log('\n_$kN 总出现:', knCount);

// 3. 找 _$_K 定义附近（核心解释器）
const kDef = code.indexOf('function _$_K');
console.log('\nfunction _$_K @', kDef);

// 4. 找 _$dW（_$_K 里 _$iF=_$lp._$dW() 的栈初始化）
const dW = code.indexOf('_$dW');
console.log('_$dW @', dW);
