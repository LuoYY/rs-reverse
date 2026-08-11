// f(cd) 完整认知总结
// 已验证的事实链：
console.log('=== f(cd) 逆向完成度总结 ===');

// 1. cd → keys（51 段，纯计算可离线）
console.log('1. cd → decryptCd → cdArr → XOR offset → ans → genKeysSim → 51 keys 段 ✓ 已实现');

// 2. keys → _$ez（numarr 拼接）
console.log('2. keys 段 → 带长度前缀拼接 → _$ez(1532B) ✓ 结构已解（[8:56]=keys2）');

// 3. _$ez → 内层 VM → base
console.log('3. _$ez + aebi[1] → _$c4 引擎 → base 原始数组（158B，环境指纹头+会话段）');
console.log('   编码器: _$hB(变长)/_$eb(1B)/_$op(2B)/_$mX(4B)/_$_c(除8)');
console.log('   写入: _$kt[_$cV++] ^= value，op=265 调度（59次×3轮）');
console.log('   值来源: 时间戳(521019862)+keys 段+环境值');

// 4. base → cookie
console.log('4. base → numarrEncrypt(huffman) → XOR keys2 → encryptMode1 → P cookie ✓ 已实现');

// 关键常量（编码器）
const k0 = {
  2: 16, 3: 240, 5: 128, 8: 31, 9: 255, 10: 24, 48: 127, 50: 8, 51: 7,
  60: 4294967295, 70: 192, 71: 65535, 114: 224, 150: 2097151, 159: 4294967296, 211: 16383, 252: 268435455
};
console.log('\n=== _$hB 变长编码阈值（k0 常量） ===');
console.log('<=127(0x7F) 1B | <=16383(0x3FFF) 2B|128 | <=2097151(0x1FFFFF) 3B|192 | <=268435455 4B|224 | else 5B|240');
console.log('k0[9]=255, k0[2]=16, k0[50]=8, k0[10]=24');

// 验证 _$hB 编码
console.log('\n=== _$hB 编码验证 ===');
function hb(v) {
  if (v <= 127) return [v];
  if (v <= 16383) return [((v >> 8) & 255) | 128, v & 255];
  if (v <= 2097151) return [((v >> 16) & 255) | 192, (v >> 8) & 255, v & 255];
  if (v <= 268435455) return [((v >> 24) & 255) | 224, (v >> 16) & 255, (v >> 8) & 255, v & 255];
  return [240, (v >> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
}
console.log('hb(0)=', hb(0).join(','));
console.log('hb(127)=', hb(127).join(','));
console.log('hb(128)=', hb(128).join(','));
console.log('hb(16383)=', hb(16383).join(','));
console.log('hb(521019862)=', hb(521019862).join(','));
console.log('\n=== base 结构（真实代理 4 样本同环境） ===');
console.log('base[0:22]=199,202,57,197,229,0,217,33,255,255,144,1,... (环境指纹，同环境固定)');
console.log('base[22:]=会话数据（keys/时间戳派生）');
console.log('尾部 40B 共享子串（#1/#2/#3）');
