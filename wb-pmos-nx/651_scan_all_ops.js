/**
 * 651_scan_all_ops.js
 * 在整个 _$kv 源码搜索所有操作码 handler（_$pn===N 或 _\$eL[_\$mJ++] 主循环）
 */
const fs = require('fs');

const kvSrc = fs.readFileSync('/tmp/nx_kv_source.js', 'utf8');

// 统计所有 _$pn===N 出现
const allMatches = [];
const re = /_\$pn===(\d+)\)\{/g;
let m;
while ((m = re.exec(kvSrc)) !== null) allMatches.push({ op: +m[1], idx: m.index });

console.log('所有 _$pn===N 出现:', allMatches.length);
const ops = [...new Set(allMatches.map(x => x.op))].sort((a, b) => a - b);
console.log('操作码数:', ops.length);
console.log('操作码:', ops.join(','));

// 找主 dispatcher（操作码最多的连续区域）
// 主 dispatcher 应该在某个 while(1){...} 里
// 找所有 while(1){ 位置
const whilePositions = [];
let wi = 0;
while ((wi = kvSrc.indexOf('while(1){', wi)) !== -1) { whilePositions.push(wi); wi += 9; }
console.log('while(1) 数量:', whilePositions.length);

// 每个 while 体里操作码数
for (const wpos of whilePositions) {
  const bodyStart = kvSrc.indexOf('{', wpos);
  let stack = 0, bodyEnd = -1;
  for (let i = bodyStart; i < kvSrc.length; i++) {
    if (kvSrc[i] === '{') stack++;
    else if (kvSrc[i] === '}') { stack--; if (stack === 0) { bodyEnd = i; break; } }
  }
  const body = kvSrc.substring(bodyStart + 1, bodyEnd);
  const cnt = allMatches.filter(x => x.idx > wpos && x.idx < bodyEnd).length;
  const size = bodyEnd - bodyStart;
  console.log(`while@${wpos}: 体长${size} 操作码${cnt}`);
}

// 主 dispatcher：找到操作码最多的 while
let best = null, bestOps = 0, bestStart = -1, bestEnd = -1;
for (const wpos of whilePositions) {
  const bodyStart = kvSrc.indexOf('{', wpos);
  let stack = 0, bodyEnd = -1;
  for (let i = bodyStart; i < kvSrc.length; i++) {
    if (kvSrc[i] === '{') stack++;
    else if (kvSrc[i] === '}') { stack--; if (stack === 0) { bodyEnd = i; break; } }
  }
  const cnt = allMatches.filter(x => x.idx > wpos && x.idx < bodyEnd).length;
  if (cnt > bestOps) { bestOps = cnt; best = wpos; bestStart = bodyStart; bestEnd = bodyEnd; }
}
console.log('\n主 dispatcher @', best, '操作码数:', bestOps);
const mainBody = kvSrc.substring(bestStart + 1, bestEnd);
fs.writeFileSync('/tmp/nx_kv_main_disp.js', mainBody);
console.log('主 dispatcher 体长:', mainBody.length);

// 提取主 dispatcher 的操作码 handlers
const handlers = {};
const re2 = /_\$pn===(\d+)\)\{/g;
while ((m = re2.exec(mainBody)) !== null) {
  const op = +m[1];
  let st = 0, end = -1;
  for (let j = m.index + m[0].length - 1; j < mainBody.length; j++) {
    if (mainBody[j] === '{') st++;
    else if (mainBody[j] === '}') { st--; if (st === 0) { end = j; break; } }
  }
  handlers[op] = mainBody.substring(m.index + m[0].length, end).trim();
}
fs.writeFileSync('/tmp/nx_kv_opcode_handlers.json', JSON.stringify(handlers, null, 1));
console.log('已保存操作码 handlers:', Object.keys(handlers).length);

// 输出全部操作码语义（简化）
console.log('\n=== 操作码语义 ===');
Object.keys(handlers).map(Number).sort((a, b) => a - b).forEach(op => {
  console.log(`op${op}: ${handlers[op].substring(0, 120)}`);
});
