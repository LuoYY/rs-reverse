/**
 * 864_vm_analyze_gq.js
 * 分析 _$gq 函数（opcode 10/725 所在）
 * 关键：_\$gq 用 _\$lP[1]（aebi[1]）作为程序流
 * opcode 725 在 aebi[1] 位置 12（早期），opcode 10 在位置 572（后期）
 * 所以 opcode 725 先执行（_$oU=_$kB[0]），此时 _\$kB 未初始化（undefined）
 * → _\$oU 变 undefined
 * 但浏览器中 opcode 725 时 _\$kB 已初始化？
 * 因为浏览器中 _\$kB 由 opcode 36 初始化（_$kB=_$ne(_$gc)）
 * 或 opcode 10 在 _\$gq 之前执行（另一个函数）
 * 关键：_\$kB 是 _\$gq 的局部变量（var 提升）
 * 初始 undefined，opcode 10 赋值 _\$pL[0]
 * 但 opcode 725 在 10 前（位置 12 < 572）
 * 所以 725 执行时 _\$kB undefined
 * 浏览器中为什么没报错？
 * 因为浏览器中 _\$kB 在 725 前已赋值（其他路径）
 * 或 725 的语义不同（_$kB[0] 是 undefined 但 _\$oU 赋值 undefined 不报错）
 * 但后续 _\$oU[88] 报错（_$oU undefined）
 * 所以浏览器中 725 后 _\$oU 有值（非 undefined）
 * 说明浏览器中 _\$kB[0] 有值
 * 我的 sandbox 中 _\$kB[0] undefined
 * 因为 _\$kB 未初始化（opcode 10 未执行）
 * 或 _\$kB 由 _\$gc 参数初始化（opcode 36）
 * 检查 _\$gc 来源
 */
const fs = require('fs');
const body = fs.readFileSync('/tmp/nx_vm_body_injected.js', 'utf8');

// 找 _$gq 函数
console.log('=== _$gq 函数 ===');
const gqIdx = body.indexOf('function _$gq');
console.log('_\$gq @', gqIdx);
if (gqIdx >= 0) {
  let depth = 0, end = gqIdx;
  for (let i = gqIdx; i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  console.log('_\$gq 范围: [' + gqIdx + '-' + end + '] size=' + (end - gqIdx));
  // 检查 _\$gq 的参数
  console.log('_\$gq 开头:', body.substring(gqIdx, gqIdx + 100));
  // 检查 _\$kB 初始化
  const fnBody = body.substring(gqIdx, end);
  console.log('含 _\$kB=_$pL[0]:', fnBody.includes('_\$kB=_$pL[0]'));
  console.log('含 _\$kB=_$ne(_$gc):', fnBody.includes('_\$kB=_$ne(_$gc)'));
  console.log('含 _\$gc:', fnBody.includes('_\$gc'));
  // 找 _\$kB 首次赋值
  let idx = 0;
  while ((idx = fnBody.indexOf('_\$kB=', idx)) >= 0) {
    console.log('_\$kB= @' + (gqIdx + idx) + ': ' + fnBody.substring(idx - 20, idx + 50).replace(/\n/g, ' '));
    idx += 4;
  }
}

// 检查 _\$gc 参数（_$c4 的第 4 参数）
console.log('=== _\$c4 参数 ===');
const c4Idx = body.indexOf('function _$c4');
console.log('_\$c4(__cg,__ez,__pL,__gc,__pb,__nx,__cQ):', body.substring(c4Idx, c4Idx + 60));
// _\$c4 调用时 _\$gc 传入什么？
// 输入 aebi 6 数组，_$c4 要 7 参数
// 缺 _\$gc？
console.log('\n=== 输入 vs _\$c4 参数 ===');
console.log('aebi 数组数:', JSON.parse(fs.readFileSync('/tmp/nx_vm_inputs2.json', 'utf8')).aebi.length);
console.log('_\$c4 参数: _\$cg,_\$ez,_\$pL,_\$gc,_\$pb,_\$nx,_\$cQ (7)');
console.log('但 IIFE 调用: (globalThis.$_ts.scj, globalThis.$_ts.aebi)');
console.log('scj = _\$lP[0]? aebi = _\$lP[1]?');
console.log('IIFE 参数 (_\$\$5,_\$lP)');
console.log('_\$\$5 = scj, _\$lP = aebi');
console.log('_\$lP[0] 用?? _\$lP[1] 用??');