// 分析整合插桩：最终 _$kt 构建期间的调用序列
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_calls_synced.json');
const ktw = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ktw_synced.json');
console.log('calls:', calls.length, 'ktw:', ktw.length);

// 找 ktW 中最后一次完整构建：cV 达到 209 或 kt 长度 209
// 打印最后 25 条快照
console.log('\n=== 最后 25 条快照 ===');
ktw.slice(-25).forEach((w, i) => {
  const idx = ktw.length - 25 + i;
  const s = w.kt ? w.kt.slice(0, 10).join(',') + '...' + w.kt.slice(60, 70).join(',') : 'null';
  console.log('#' + idx + ' seq=' + w.seq + ' cV=' + w.cV + ' len=' + (w.kt ? w.kt.length : 0) + ' [0:10]=' + s);
});

// 找最后一次 cV>=200 的快照
const lastBig = ktw.reduce((acc, w, i) => (w.cV >= 200 || (w.kt && w.kt.length >= 200)) ? i : acc, -1);
console.log('\n最后一次完整构建 @快照#' + lastBig, 'seq=' + ktw[lastBig] && ktw[lastBig].seq, 'cV=' + ktw[lastBig].cV);

// 该快照前的调用（同 seq 或 seq-1）
const seqAt = ktw[lastBig].seq;
console.log('该快照 seq:', seqAt);
// 找 seq 附近的调用
console.log('\n=== seq=' + (seqAt - 1) + ' 附近调用 ===');
const around = calls.filter(c => c.seq >= seqAt - 5 && c.seq <= seqAt + 2);
around.forEach(c => console.log('  seq=' + c.seq + ' op=' + c.op + ' args=' + c.args));

// 完整显示最后 40 条调用
console.log('\n=== 最后 40 条调用 ===');
calls.slice(-40).forEach(c => console.log('  seq=' + c.seq + ' op=' + c.op + ' args=' + c.args));
