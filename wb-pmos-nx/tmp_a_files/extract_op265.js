// 提取 op=265 的完整语义（base 编码调度的核心）
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
// op=265 在 c4 中
const m = c4.match(/_\$pW===265\)\{([^}]*)\}/);
console.log('op=265 语义:', m ? m[1] : 'N/A');
// 但 265 也作为内层 opcode 出现（_$c4(265,...) 是内层调用）
// 检查 _$c4(265 相关的内层处理
console.log('\n=== 内层 _$jZ 中 265 相关 ===');
// 265 在内层 dispatcher 中怎么处理
// 从调用看 op=265 有参数 1024/128（编码标志）
// 这些对应 _$hB 的编码分支（128/192/224 前缀）
console.log('128=0x80, 192=0xC0, 224=0xE0, 240=0xF0');
console.log('1024 = 0x400');
// _$hB 编码：<=127 1B / <=16383 2B(128前缀) / <=2097151 3B(192) / ...
// 所以 265|128|值 = 用 2B 编码（128 前缀）
// 265|1024|值 = 用特殊编码（1024 不是标准前缀）
console.log('\n分析: op=265 是"写入值到 base"操作');
console.log('第二参数 128/1024 = 编码类型/位置标志');
console.log('第三参数 = 要编码的值（时间戳或段值）');
