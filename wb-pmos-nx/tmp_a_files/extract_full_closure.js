// 提取完整 JSVMP 闭包：_$kx(@114483) + _$iE(@115304) + 所有辅助（_$cS 等）
// 找包含两者的最小外层函数
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// _\$kx 定义位置
const kxStart = 114483;
// _\$iE 定义位置
const iEStart = 112785;
// 找覆盖两者的外层函数（从 iEStart 前找）
// 由于 iE 在 112785，kx 在 114483，找包含两者的最小函数
// 直接提取 [112785, 116000] 区域（包含 _$kx/_$iE/_$cS/辅助）
const region = c.slice(112785, 116500);
console.log('区域长度:', region.length);
// 检查包含的关键函数
for (const v of ['function _$iE(', 'function _$kx(', 'function _$cS(', 'function _$iR(', 'function _$iz(', 'function _$en(', 'function _$$6(']) {
  console.log('  含', v, region.includes(v) ? '✓' : '✗');
}
fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/jsvmp_full_region.js', region);
console.log('已保存 jsvmp_full_region.js');
// 区域开头
console.log('\n开头 200:', region.slice(0, 200));
