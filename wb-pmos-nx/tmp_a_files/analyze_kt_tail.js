// 深入分析 _$kt 写入事件尾部：最终数组如何形成
// 目标：找出最后一次填充 base 编码区的写入事件，对比最终值
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
const ktFinal = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');
const base = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_base_from_kt.json');
console.log('总快照数:', writes.length, '最终kt len:', ktFinal.length, 'base len:', base.length);

// 找最后一次包含位置65-208的完整快照，与最终 kt 对比
// 找到与 ktFinal 完全一致的最后快照
let lastMatch = -1;
for (let i = writes.length - 1; i >= 0; i--) {
  const w = writes[i];
  if (!w.kt) continue;
  let ok = true;
  for (let j = 0; j < 209; j++) {
    if (w.kt[j] !== ktFinal[j]) { ok = false; break; }
  }
  if (ok) { lastMatch = i; break; }
}
console.log('与最终kt完全一致的快照 #' + lastMatch + ' (cV=' + (lastMatch >= 0 ? writes[lastMatch].cV : '?') + ')');

// 打印最后 30 条快照的关键信息
console.log('\n=== 最后 35 条快照 ===');
for (let i = Math.max(0, writes.length - 35); i < writes.length; i++) {
  const w = writes[i];
  const s = w.kt ? w.kt.slice(63, 80).join(',') : 'null';
  console.log('#' + i + ' cV=' + w.cV + ' kt[63:80]=' + s);
}

// 事件 diff：找出最后 20 条记录的变化（完整位置列表）
console.log('\n=== 最后 15 次变化事件（完整） ===');
const events = [];
let prev = null;
for (let i = 0; i < writes.length; i++) {
  const w = writes[i];
  if (!w.kt) continue;
  if (prev) {
    const changes = [];
    const max = Math.max(prev.length, w.kt.length);
    for (let j = 0; j < max; j++) {
      if (prev[j] !== w.kt[j]) changes.push([j, w.kt[j] === undefined ? -1 : w.kt[j]]);
    }
    if (changes.length) events.push({ i, cV: w.cV, changes });
  } else {
    events.push({ i, cV: w.cV, changes: w.kt.map((v, j) => [j, v]) });
  }
  prev = w.kt;
}
events.slice(-15).forEach(e => {
  const s = e.changes.map(c => '#' + c[0] + '=' + c[1]).join(' ');
  console.log('事件@快照#' + e.i + ' cV=' + e.cV + ' 变化(' + e.changes.length + '): ' + s.slice(0, 400));
  console.log();
});
