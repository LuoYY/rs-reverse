/**
 * 368_disp3_raw.js
 * 从原始动态代码（未插桩）动态定位 dispatcher #3，分析死循环 opcode 分支
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode.js', 'utf8');

// 定位所有 dispatcher：while(1){X=arr[pc++];if(X<444){
const dispatchers = [];
const re = /while\(1\)\{([_$\w]+)=([_$\w]+)\[([_$\w]+)\+\+\];if\(\1<444\)\{/g;
let m;
while ((m = re.exec(code)) !== null) {
  dispatchers.push({ idx: m.index, op: m[1], arr: m[2], pc: m[3] });
  if (dispatchers.length > 10) break;
}
console.log('dispatcher 数量:', dispatchers.length);
dispatchers.forEach((d, i) => console.log(`#${i}: @${d.idx} op=${d.op} arr=${d.arr} pc=${d.pc}`));

// 用最后一个 dispatcher（通常是主循环，含 keys 生成）
const d = dispatchers[dispatchers.length - 1];
if (!d) process.exit(1);
console.log('\n使用 dispatcher #' + (dispatchers.length - 1), 'op=' + d.op);
const seg = code.substring(d.idx, d.idx + 30000);

// 死循环 opcode 序列（跨会话一致）
const loopOps = [383, 69, 141, 105, 356, 398, 122, 406, 318, 285, 401, 274, 135, 225, 0, 205];
for (const op of loopOps) {
  const idx = seg.indexOf('===' + op);
  if (idx < 0) { console.log(`\nop${op}: 未找到 ===`); continue; }
  let branch = seg.substring(idx + 5, idx + 220);
  const end1 = branch.indexOf('}else');
  const end2 = branch.indexOf('}}');
  let end = end1 >= 0 ? end1 : end2;
  if (end < 0) end = 220;
  console.log(`\nop${op}:`, branch.substring(0, end).replace(/\n/g, ' ').substring(0, 190));
}

// 打印 opcode 0-10 附近的 PC 跳转（条件跳转模式：!X?PC+=N:0）
console.log('\n=== 条件跳转模式（!X?PC+=N:0）===');
const jumps = seg.match(new RegExp('!' + d.op + '?[^;]{0,30};', 'g'));
if (jumps) console.log('opcode 条件跳转:', jumps.slice(0, 10).join(' | '));
// 环境标志跳转
const eJumps = seg.match(/!_\$\w+\?_\$h8\+=[^;]{0,10};/g);
console.log('环境标志跳转(静态 _$h8):', eJumps ? eJumps.slice(0, 10) : '无');
