// 验证：_$ez[7:55] = keys2？_$ez = 头 + keys2 + keys 段拼接
const fs = require('fs');
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;
const p1 = require('./nx_p1.json');

// P cookie 里 cookieK2 = keys2
// 但这里 _$ez 是本地固定 challenge 的，P 是真实代理的——keys2 不同！
// 关键：检查 _$ez[7:55] 的结构是否 = 一个 48B 数组
console.log('_$ez[7:55]:', ez.slice(7, 55).join(','));
console.log('_$ez[7:55] len:', ez.slice(7, 55).length);
// 48B keys2 的话：7+48=55
console.log('_$ez[55:]:', ez.slice(55, 60).join(','));
// 转 ASCII
console.log('_$ez[7:55] ASCII:', ez.slice(7, 55).map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));

// _$ez 头 [0:7] = 51,2,54,52,2,54,52 = '3',2,'6','4',2,'6','4'
// 解码: 3,64,2,64 → 这是 numarr 编码的 "3,64,2,64"? 或长度标记
// 51='3', 54='6', 52='4', 48='0' → "3640"?
// 头可能是: [版本=3][分隔=2][长度64?][分隔=2][?]
console.log('\n_$ez[0:7] 头解析:', ez.slice(0, 7).join(','));
// 检查是否 = 长度编码：_$ez 总长 1532
// 1532 的 numarr: "1532" → 数字字符
console.log('1532 编码: 1,53,50,52? 不，实际是 1532 → 字符 1,5,3,2 = 49,53,51,50');
console.log('_$ez[3:7]=', ez.slice(3, 7).join(','), '= 54,52,2,54');
