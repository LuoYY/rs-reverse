// 提取 JSVMP 字节码执行器完整区域（@93880 附近的 _$cS/_$pC/_$f1/_$dI 及其处理器）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// JSVMP 解释器从 @93880（_$cS push 版）到下一个大函数
// 找 _$aq 函数定义（JSVMP 包装器）
let i = c.indexOf('function _$aq(');
console.log('function _$aq( @' + i, i >= 0 ? c.slice(i, i + 300) : '');
// 找 _$md 初始化（gS 赋值）
let j = c.indexOf('_$md={');
console.log('\n_$md={ @' + j, j >= 0 ? c.slice(j, j + 200) : '');
// JSVMP 解释器区域：从 @93880 前找函数边界
// 找 '$b4' 相关（_$dI 值对象）
let k = c.indexOf('function _$dI(');
console.log('\nfunction _$dI( @' + k, k >= 0 ? c.slice(k, k + 200) : '');
// 保存 @93000 到 @100000 区域（JSVMP 解释器）
console.log('\n=== 区域 93000-101000 保存 ===');
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_interp_region.js', c.slice(93000, 101000));
console.log('已保存 jsvmp_interp_region.js len=' + (101000 - 93000));
