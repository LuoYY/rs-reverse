const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
const start = 168107, end = 347085;
const seg = c.slice(start, end);
// while(3) 结构：if(_$jc<444){if(_$jc<256){<0-255>}else{<256-443>}}else{<444+>}
// 找 256-444 区：从 <256) 的 else { 开始
// 找 '<256){' 后第一个 '{' 的 else
// 简化：找 '_$jc===383' 或 383 处理。383 是 opcode 值，代码形式可能是 else{...383 分支...}
// 用二分定位：_$jc<444 块的 else 是 >=444；<256 的 else 是 256-443
// 在 seg 里找 '_$jc<444)' 对应的 else
const idx444 = seg.indexOf('_$jc<444){');
console.log('_$jc<444){ @' + (start + idx444));
// <444 块内找 <256 的 else（256-444 区起点）
// 从 idx444 开始找 '<256){' 后面匹配的 else
const idx256 = seg.indexOf('_$jc<256){', idx444);
console.log('_$jc<256){ @' + (start + idx256));
// 256 块结束：从 idx256 找平衡括号
let depth = 0, end256 = -1;
for (let i = idx256; i < seg.length; i++) {
  if (seg[i] === '{') depth++;
  else if (seg[i] === '}') { depth--; if (depth === 0) { end256 = i; break; } }
}
console.log('<256 块结束 @' + (start + end256));
// 256-444 区 = end256 到 <444 的 else
// 在 256-444 区搜 383
const r = seg.slice(end256 + 1, end256 + 8000);
console.log('\n=== 256-444 区(前 8000) ===');
console.log(r);
