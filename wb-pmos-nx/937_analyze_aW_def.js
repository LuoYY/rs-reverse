/**
 * 937_analyze_aW_def.js
 * 找 _\$aW 定义 + 程序流 opcode 1/44 顺序
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body.js', 'utf8');
const inputs = JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8'));

// 1. 找 _\$aW 定义（函数或赋值）
console.log('=== _\$aW 定义 ===');
// 找 function _$aW
const aWFn = body.indexOf('function _$aW');
console.log('function _$aW @', aWFn);
// 找 _$aW= 赋值
let idx = 0;
while ((idx = body.indexOf('_\$aW=', idx)) >= 0) {
  const ctx = body.substring(idx - 30, idx + 50).replace(/\n/g, ' ');
  console.log('_\$aW= @' + idx + ': ' + ctx.substring(0, 80));
  idx += 4;
}
// 找 var _$aW
const varAW = body.indexOf('var _$aW');
console.log('var _$aW @', varAW);

// 2. 找 _\$cM 在 opcode 44 的上下文（_$nZ:_$kB）
console.log('\n=== opcode 44（_$nZ:_$kB） ===');
const op44 = body.indexOf('_$nZ:_$kB');
console.log('opcode 44 @', op44);
if (op44 >= 0) {
  console.log('完整上下文:', body.substring(op44 - 300, op44 + 200).replace(/\n/g, ' '));
}

// 3. 检查程序流 aebi[1] 中 opcode 1/44 顺序
console.log('\n=== aebi[1] opcode 顺序 ===');
const p1 = inputs.aebi[1];
console.log('aebi[1] 中 1 @', p1.indexOf(1), '44 @', p1.indexOf(44), '1在44前:', p1.indexOf(1) < p1.indexOf(44));
console.log('aebi[1] 中 725 @', p1.indexOf(725), '736 @', p1.indexOf(736));

// 4. 关键：_\$cM 在 opcode 1 时的值
// opcode 1: _$kB=_$aW(_$kB,_$cM._$nZ)
// _$cM 必须含 _\$nZ 方法
// opcode 44 构造 _$cM={_$nZ:_$kB,...}
// 但 opcode 44 是 return（返回对象），不是赋值给 _$cM
// 所以 _$cM 由 opcode 736（_$cM=_$$_[_$gH]）赋值
// _$$_ 来自 _$pL[_$gH]（程序流元素）
// 该元素（对象）有 _\$nZ 方法
// 检查 aebi 中是否有对象元素
console.log('\n=== aebi 中对象元素 ===');
inputs.aebi.forEach((a, i) => {
  const objCount = a.filter(v => typeof v === 'object' && v !== null).length;
  console.log('aebi[' + i + '] 对象元素:', objCount);
});