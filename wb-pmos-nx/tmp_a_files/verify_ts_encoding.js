// 验证：base 头 = 时间戳的编码？
// base[0:4] = 110,199,86,237（len=200 快照）
// 时间戳 = 521019862
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
// 找 base 数组（len=200）的完整内容
const kt200 = writes[23].kt;
console.log('base(len200) head[0:16]:', kt200.slice(0, 16).join(','));
console.log('base(len200) [4:8]:', kt200.slice(4, 8).join(','), '(应为 nextarr 头 4,8?)');

// 521019862 的字节
const ts = 521019862;
console.log('\n521019862 = 0x' + ts.toString(16));
console.log('字节(大端):', [(ts >> 24) & 255, (ts >> 16) & 255, (ts >> 8) & 255, ts & 255].join(','));
console.log('base[0:4]:', kt200.slice(0, 4).join(','));

// base[0:4] XOR ts字节
const tsB = [(ts >> 24) & 255, (ts >> 16) & 255, (ts >> 8) & 255, ts & 255];
console.log('\nXOR:', kt200.slice(0, 4).map((v, i) => v ^ tsB[i]).join(','));

// 尝试 base[0:4] = ts 的 numarr 编码（_$hB 变长编码）
// _$hB: <=127 1字节 / <=16383 2字节 / <=2097151 3字节 / <=268435455 4字节
// 521019862 <= 268435455 → 4字节编码（高位|224）
// 编码: [((v>>24)&255)|224, (v>>16)&255, (v>>8)&255, v&255]
// 但 521019862 = 0x1F0E8C56 → (>>24)=0x1F=31 → 31|224=255, 0x0E=14, 0x8C=140, 0x56=86
const v = 521019862;
const enc4 = [((v >> 24) & 255) | 224, (v >> 16) & 255, (v >> 8) & 255, v & 255];
console.log('\n521019862 _$hB 4B编码:', enc4.join(','));
console.log('base[0:4]:', kt200.slice(0, 4).join(','));

// 下一个值：521019863
const v2 = 521019863;
const enc4b = [((v2 >> 24) & 255) | 224, (v2 >> 16) & 255, (v2 >> 8) & 255, v2 & 255];
console.log('521019863 _$hB 4B编码:', enc4b.join(','));
console.log('base[4:8]:', kt200.slice(4, 8).join(','));
