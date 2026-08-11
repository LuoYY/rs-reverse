// 分析 op=1842 的完整参数：arr143/arr209/arr21 内容
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_1842_calls.json');
const ktF = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_ktF_1842.json');
console.log('calls:', calls.length, 'ktF len:', ktF.length);

calls.forEach((c, i) => {
  console.log('\n===== 调用#' + i + ' seq=' + c.seq + ' =====');
  c.args.forEach((a, j) => {
    if (a && a.x) {
      console.log('  arg' + j + ' [' + a.x.length + ']: ' + a.x.slice(0, 40).join(','));
      if (a.x.length > 40) console.log('  ...tail:', a.x.slice(-15).join(','));
    } else {
      console.log('  arg' + j + ': ' + a);
    }
  });
  if (c.kt) console.log('  kt[' + c.kt.length + ']: ' + c.kt.slice(0, 15).join(',') + ' ... ' + c.kt.slice(60, 75).join(','));
});

// 对比 ktF（最终）与调用时的 kt
console.log('\nktF[0:30]:', ktF.slice(0, 30).join(','));
console.log('ktF[63:80]:', ktF.slice(63, 80).join(','));
