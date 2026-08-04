/**
 * vm_arch_analysis.js
 * 分析 dyn-code.js 的 VM 架构，确定捕获策略
 * 关键发现：_
$o9 = VM 分发器（含 _$fA 操作符表），base 生成 = 运行时 VM program 执行
 */
const fs = require('fs');
const src = fs.readFileSync('wb-pmos-nx/captures/dyn-code.js', 'utf8');

// 1. 找 VM 主循环（含 _\$bk[4][...] 栈操作 + 分发）
// 特征：_$bk[4][_$k2[17]] 或 _$bk[4][...] 大量出现
const mainLoopIdx = src.indexOf('_$bk[4][_$k2[17]]');
console.log('VM 栈操作 _$bk[4][_$k2[17]] @', mainLoopIdx);
if (mainLoopIdx >= 0) {
  const start = src.lastIndexOf('function', mainLoopIdx);
  const nameMatch = src.substring(start, start + 60).match(/function (_\$\w+)/);
  console.log('外层函数（VM 主循环）:', nameMatch ? nameMatch[1] : '?', '@', start);
}

// 2. 找 _$fA 操作符表定义（_$fA[xxx]= 赋值）
const fAAssigns = [];
let idx = 0;
while ((idx = src.indexOf('_$fA[', idx)) >= 0) {
  const ctx = src.substring(idx, idx + 40);
  if (ctx.includes(']=')) {
    fAAssigns.push({ pos: idx, ctx: ctx.substring(0, 30) });
  }
  idx += 4;
}
console.log('_$fA 赋值处:', fAAssigns.length, '个');
if (fAAssigns.length) console.log('  首个:', fAAssigns[0].pos, fAAssigns[0].ctx);

// 3. 找 _$ln（_$o9 调用的主执行）
const lnIdx = src.indexOf('function _$ln');
console.log('_\$ln @', lnIdx);

// 4. 找包含大量 opcode 分发的函数（VM 主解释器）
// 特征：while(1) + _$bk[4] 读写
const patterns = {
  '_$bk[4][_$k2[17]](_$mC,': '栈push模式',
  '_$bk[4][_$k2[17]](_$mC,_$ae': '栈操作',
  'while(1)': '主循环',
};
for (const [p, label] of Object.entries(patterns)) {
  const i = src.indexOf(p);
  console.log(`  ${label} ${p}: @${i}`);
}

// 5. 关键：huffman 编码器 _$ph（@167999 附近）
const phIdx = src.indexOf('function _$ph');
console.log('_\$ph (huffman) @', phIdx);

// 6. 总结
console.log('\n=== VM 架构总结 ===');
console.log('dyn-code.js = 外层 VM 解释器（JS 解析器），包含：');
console.log('  - _$o9: VM 分发器（含 _$fA 操作符表查表）');
console.log('  - _$ln: 主执行函数');
console.log('  - _$ph: huffman 编码器（base 的 be 段生成）');
console.log('  - _$oQ: 字节码读取器');
console.log('  - _$aq/_$li: trampoline 工厂');
console.log('base 生成 = 运行时 VM program 执行（输入明文 basearr）');
console.log('常量表（_$eb/_$k2/_$mv/_$kH/_$ae/_$mC/_$cr/_$T）运行时动态生成');