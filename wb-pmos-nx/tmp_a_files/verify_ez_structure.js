// _$ez = numarrJoin 结构：验证段边界（长度前缀 + 数据）
// 头 [0:7]=51,2,54,52,2,54,52 → 可能是 numarrJoin(1, seg) 的标记
// [7]=48 → 段长？[8:56]=48B keys2？但 keys2 应以 48 开头
const fs = require('fs');
const ezSnap = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ez_full_final.json', 'utf8'));
const ez = ezSnap[0].ez.v;

// numarrJoin 编码：_$ez 值域 0-63？不，有 74,239,100 > 63
// 实际是原始字节流（0-255）+ 控制
// [7]=48 可能是 keys2 的"长度"，[8:56]=keys2
console.log('假设: [7]=48 长度标记, [8:56]=keys2');
console.log('[8:56]:', ez.slice(8, 56).join(','));
console.log('[8:56] len:', ez.slice(8, 56).length);

// 看 keys2 应该是 48B：从 cookie 解出的 keys2 与这里对比
// 本地固定 challenge 的 P cookie keys2（从 nx_p1.json）
const p1 = require('./nx_p1.json');
console.log('\nP1 cookie 长度:', p1.P.length);

// 用 extract_base_from_p 的解出逻辑（keys2 来自 na[11:59]）
// 但需要 K16 解密——复用之前逻辑太复杂，直接看结构
// _$ez[56:] 下一段
console.log('\n[56:60]:', ez.slice(56, 60).join(','), 'ASCII:', ez.slice(56, 60).map(v => String.fromCharCode(v)).join(''));
// 找下一个长度标记模式：49,51,53... 数字字符 + 段
console.log('\n整个 _$ez 值域:', Math.min(...ez), '-', Math.max(...ez));

// 尝试用"数字字符段"解析（资源名等）
// keys[7] 资源列表 = "ySMTydHh;MurR7rxG;..." 是 ASCII 字符
// 在 _$ez 中应该能找到这些字符（如果 _$ez 是拼接）
const str = ez.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join('');
console.log('\n_$ez 含 ySMTydHh:', str.includes('ySMTydHh'));
console.log('_$ez 含 MurR7rxG:', str.includes('MurR7rxG'));
console.log('_$ez 含 3RKyaeh47p90:', str.includes('3RKyaeh47p90'));
console.log('_$ez 含 2437991.js:', str.includes('2437991.js'));
console.log('_$ez 含 7z,a,aac:', str.includes('7z,a,aac'));
console.log('_$ez 含 67402:', str.includes('67402'));
console.log('_$ez 含 521019862:', str.includes('521019862'));
console.log('_$ez 含 60000:', str.includes('60000'));
console.log('_$ez 含 _$kI:', str.includes('_$kI'));
