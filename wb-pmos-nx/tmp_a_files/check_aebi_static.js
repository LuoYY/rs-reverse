// aebi[1] 是否跨 cd 固定？
// 方法：本地固定 challenge 的 dynCode 中，aebi 是输入参数
// 如果 aebi = 纯 opcode 序列（无 cd 数据），跨 cd 固定 → 可静态
// 检查 dynCode 中 aebi 的引用（_$lP[1] = aebi[1]）
const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');
// aebi 参数名是 _$lP（IIFE 第二参数）
// 找 _$lP 的使用
const refs = (code.match(/_$lP/g) || []).length;
console.log('_$lP 引用数:', refs);
// 找 _$lP[1]（aebi[1]）
const idx = code.indexOf('_$lP[1]');
console.log('_$lP[1] @', idx, 'ctx:', idx >= 0 ? code.slice(idx - 30, idx + 50) : '');
// aebi[1] 长度 2553 → 检查 _$lP.length 或 aebi 结构
console.log('\n_$lP[0] 使用:', (code.match(/_$lP\[0\]/g) || []).length);
// 找 scj 使用（_$$5 是 scj）
console.log('_$$5 引用数:', (code.match(/_$$5/g) || []).length);
