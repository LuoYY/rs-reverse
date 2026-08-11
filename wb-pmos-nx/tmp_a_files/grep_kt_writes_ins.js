// 找 nx_exec_exact.json 中所有 _$kt 写入指令
const d = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_exact.json');
// 找 _\$kt[ 或 _\$kt= 或 _\$kt.push
d.forEach(x => {
  const c = x.code;
  if ((c.includes('_$kt[') || c.includes('_$kt=') || c.includes('_$kt.push') || c.includes('_$kt.')) && !c.startsWith('_$kt=[_$k0[')) {
    console.log('IDX' + x.idx + ' pc' + x.pc + ' op' + x.op + ' | ' + c.slice(0, 110));
  }
});
console.log('\n--- pc=1527 完整指令的 _$k0 索引数统计 ---');
const ins1527 = d.find(x => x.pc === 1527);
if (ins1527) {
  const m = ins1527.code.match(/_$k0\[(\d+)\]/g);
  console.log('_$k0 索引出现次数:', m ? m.length : 0);
  const m2 = ins1527.code.match(/_\$k0\[(\d+)\]/g).map(s => parseInt(s.match(/\d+/)[0]));
  // 统计索引频率
  const freq = {};
  m2.forEach(i => freq[i] = (freq[i] || 0) + 1);
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('高频索引:', top.map(([i, n]) => 'k0[' + i + ']×' + n).join(' '));
}
