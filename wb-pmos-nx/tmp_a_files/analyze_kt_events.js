// 从 nx_kt_writes.json 重构 _$kt 写入序列：(位置, 值) 列表
// 然后对照 base 解码（huffman）验证：_$kt[65:] 与 base 数组关系
const writes = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_writes.json');
console.log('总快照数:', writes.length);

// 逐条 diff，记录每次变化
const events = [];
let prev = null;
for (let i = 0; i < writes.length; i++) {
  const w = writes[i];
  if (!w.kt) continue;
  if (prev) {
    const changes = [];
    const max = Math.max(prev.length, w.kt.length);
    for (let j = 0; j < max; j++) {
      const a = prev[j] === undefined ? -1 : prev[j];
      const b = w.kt[j] === undefined ? -1 : w.kt[j];
      if (a !== b) changes.push([j, b]);
    }
    if (changes.length) events.push({ snap: i, cV: w.cV, changes });
  } else {
    events.push({ snap: i, cV: w.cV, changes: w.kt.map((v, j) => [j, v]).slice(0, 300) });
  }
  prev = w.kt;
}
console.log('事件数:', events.length);

// 打印 cV 65 之后的写入（base 编码区）
console.log('\n=== base 编码区（位置>=63）写入事件 ===');
let lastReported = -1;
events.forEach((e, i) => {
  const sig = e.changes.filter(c => c[0] >= 63 && c[0] < 210);
  if (sig.length) {
    const cV = e.cV;
    if (cV !== lastReported) { console.log('  -- cV 跳到 ' + cV + ' @事件#' + i + ' (snap ' + e.snap + ')'); lastReported = cV; }
    const posStr = sig.slice(0, 12).map(c => '#' + c[0] + '=' + c[1]).join(' ');
    console.log('  事件#' + i + ' cV=' + cV + ' 变化(' + sig.length + '): ' + posStr);
  }
});
