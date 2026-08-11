// 对比 ktFinal vs kt_writes 最后快照：找出差异
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
const ktFinal = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');

console.log('ktFinal len:', ktFinal.length);
// 打印最后 3 个快照的数组长度
[302, 303, 304, 305].forEach(i => {
  const w = writes[i];
  console.log('snap#' + i + ' cV=' + w.cV + ' kt.len=' + (w.kt ? w.kt.length : 'null'));
});

// 对比 snap#304 与 ktFinal
const s304 = writes[304].kt;
console.log('\nsnap#304 len:', s304.length);
let firstDiff = -1, diffs = [];
for (let j = 0; j < Math.max(s304.length, ktFinal.length); j++) {
  if (s304[j] !== ktFinal[j]) {
    if (firstDiff < 0) firstDiff = j;
    if (diffs.length < 30) diffs.push('#' + j + ': snap=' + s304[j] + ' final=' + ktFinal[j]);
  }
}
console.log('首个差异位置:', firstDiff);
console.log('差异列表:', diffs.join('  '));

// snap#305
const s305 = writes[305].kt;
console.log('\nsnap#305 len:', s305.length);
console.log('snap#305[60:80]:', s305.slice(60, 80).join(','));
console.log('ktFinal[60:80]:', ktFinal.slice(60, 80).join(','));

// 检查 snap#304 是否存在 [65] 多一个 99 的偏移假设
console.log('\n偏移假设验证：snap#304[j+1] vs ktFinal[j] 匹配数');
let matchShift = 0;
for (let j = 0; j < 100; j++) {
  if (s304[j + 1] === ktFinal[j]) matchShift++;
}
console.log('匹配(offset+1):', matchShift + '/100');
let matchNoShift = 0;
for (let j = 0; j < 100; j++) {
  if (s304[j] === ktFinal[j]) matchNoShift++;
}
console.log('匹配(no offset):', matchNoShift + '/100');

// 保存 snap#305 完整数组用于后续
require('fs').writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_snap305.json', JSON.stringify(s305));
