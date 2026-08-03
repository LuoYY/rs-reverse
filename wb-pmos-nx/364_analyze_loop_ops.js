/**
 * 364_analyze_loop_ops.js
 * 分析 dispatcher #3 死循环 opcode 序列的分支代码，理解死循环原因
 */
const fs = require('fs');

const code = fs.readFileSync('/tmp/nx_dyncode_patched.js', 'utf8');

// 找 dispatcher #3（__w3 的 while）
const i = code.indexOf('__w3=');
if (i < 0) { console.log('无 w3'); process.exit(1); }
// 从 while 开始提取 dispatcher #3 函数体
const whileStart = code.lastIndexOf('while(1){', i);
console.log('dispatcher #3 @', whileStart);

// 提取函数体（直到函数结束——找 })( 或分号）
// 简化：提取 20000 字符
const seg = code.substring(whileStart, whileStart + 20000);
fs.writeFileSync('/tmp/disp3_seg.js', seg);
console.log('已提取 dispatcher #3 段, 长度:', seg.length);

// opcode 变量名
const om = seg.match(/window\.__all=\(window\.__all\|\|0\)\+1;window\.__op3=window\.__op3\|\|\[\];window\.__op3\.push\(([_$\w]+)\);if\(window\.__op3\.length>40\)window\.__op3\.shift\(\);window\.__pX3=([_$\w]+);([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];/);
if (om) {
  console.log('opcode 变量:', om[3], '指令数组:', om[4], 'PC:', om[5]);
  global.OP = om[3]; global.PC = om[5]; global.ARR = om[4];
}

// 分析死循环 opcode 分支（383/69/141/105/356/398/122/406/318/285/401/274/135/225/0/205）
const loopOps = [383, 69, 141, 105, 356, 398, 122, 406, 318, 285, 401, 274, 135, 225, 0, 205];
for (const op of loopOps.slice(0, 8)) {
  // 找 if(opcode===N){ 分支
  const pat = new RegExp('if\\(' + OP + '===' + op + '\\)\\{[\\s\\S]{0,300}?\\}');
  const m2 = seg.match(pat);
  console.log(`\n=== opcode ${op} ===`);
  console.log(m2 ? m2[0].substring(0, 300) : '未找到分支');
}

// 找 PC 跳转（_$kF+= 等回退）
console.log('\n=== PC 跳转操作（回退）===');
const pJumps = seg.match(new RegExp(PC + '\\+=[^;]{0,20};', 'g'));
if (pJumps) {
  // 统计负数跳转
  const neg = pJumps.filter(j => /\+=-?\d+/.test(j));
  console.log('PC += 操作:', pJumps.slice(0, 15));
  console.log('负数跳转:', neg.slice(0, 10));
} else {
  console.log('无 PC 跳转（可能用 switch/其他）');
}
