// 解析 nx_kt_final.json（209B 完整 nextarr）
// 结构: [0,0,0,0, 4,8, r2mka4, startT4, 48, keys2(48), beLen2, base_encoded]
const kt = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');
console.log('kt len:', kt.length);
console.log('kt[0:30]:', kt.slice(0, 30).join(','));
console.log('kt 尾 30:', kt.slice(-30).join(','));

// 结构解析
console.log('\n=== 结构 ===');
console.log('[0:4]:', kt.slice(0, 4).join(','), '(uuid 前缀?)');
console.log('[4:6]:', kt.slice(4, 6).join(','), '(应 4,8)');
console.log('[6:10]:', kt.slice(6, 10).join(','), '(r2mka)');
console.log('[10:14]:', kt.slice(10, 14).join(','), '(startT)');
console.log('[14]:', kt[14], '(应 48)');
console.log('[15:63]:', kt.slice(15, 63).join(','), '(keys2 48B)');
// keys2 应该是 74,239,100,9,...（已知）
console.log('keys2 期望: 74,239,100,9,...');
console.log('[15:19]:', kt.slice(15, 19).join(','));
// beLen
console.log('[63:65]:', kt.slice(63, 65).join(','), '(beLen)');
// base 编码
console.log('[65:]:', kt.slice(65, 80).join(','), '(base 编码前 15)');
console.log('base 编码长度:', kt.length - 65);
