/**
 * 728_A54_env_props.js
 * 分析 _\$_1 环境对象（window）缺哪些属性：dump _\$eF 属性名池中报错用到的索引对应的属性名
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
// 报错点：opcode 231 (读取 '27')、188 (读取 '14')、322 (读取 '38')、6 (读取 '78')、272 (读取 '10')、38 (读取 '110')
// 这些是 _\$_1[(_\$eF)[N]] 或 _\$_1[(_\$kd)[N]] 等，属性名池 _\$eF/_\$kd/_\$oV
// 属性名池在 opcode 224/1009 等赋值：_\$eF=_\$dU[0], _\$kd=_\$dU[2], _\$oV=_\$dU[3]
// _\$dU 来自 aebi[0]（648 元素）—— 但属性名池应该是字符串数组

// 搜索属性名池解码：_\$eF 是字符串数组（属性名），从 aebi 解码
// 观察 _\$eF 的定义点
const eFIdx = code.indexOf('_$eF=_$dU[0]');
console.log('_$eF=_$dU[0] @', eFIdx);
console.log(code.substring(eFIdx - 200, eFIdx + 200));
// aebi[0] 是数字数组（648 元素），_\$dU[0] 应该是其中一个字符串池
// 看 _\$dU 如何被填充：opcode 159 _\$dU=window['$_ts']
console.log('\n=== _\$dU 与 aebi 关系 ===');
console.log(code.substring(code.indexOf('_$dU=_$iA(') - 100, code.indexOf('_$dU=_$iA(') + 200));
