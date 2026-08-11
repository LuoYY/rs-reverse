const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = c.indexOf('while(1){_$jc=_$ib[_$oL++];');
const seg = c.slice(start, start + 90000);
// while(3) 结构：if(_$jc<444){if(_$jc<256){...<256区>...}else{<256-444区>}}else{<>=444区>}
// 256-444 区的起点：找 if(_$jc<256){ 的 else {
// seg 开头 1800 显示：if(_$jc<444){if(_$jc<256){if(_$jc<64){...
// 256-444 区 = _$jc<256 else 块。找到它的结束（匹配括号）后打印
// 找 '<256)' 的 else：从 43 开始找 '{' 的 else
// 简化：直接找 '<444)' 对应的 else 块（>=444 区），打印 256-444 区（在 <444 的 else 和 >=444 的 else 之间）
// 策略：找所有 '<256' 的 else 后的内容。打印 seg 中 '<256)' 之后 40k 字符（包含 256-444 区）
// 实际 256-444 区在哪？先看 <444 else 之前的内容量。
// 打印 '<256)' 的平衡括号。从 i256=43 开始
const i256 = 43;
let depth = 0, inElse = false, end = -1;
for (let i = i256; i < seg.length; i++) {
  const ch = seg[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
console.log('if(_$jc<256){ 块结束 @' + end + ' 绝对' + (start + end));
console.log('该块长度:', end - i256);
console.log('\n=== 块内容 全部(前 30000) ===');
console.log(seg.slice(i256, i256 + 30000));
