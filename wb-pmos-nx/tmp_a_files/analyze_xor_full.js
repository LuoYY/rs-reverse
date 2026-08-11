const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_xor_full.json', 'utf8'));
console.log('总条数:', data.length);
// 分组显示 op 611 vs 1615
data.forEach((d, i) => {
  const ez = d.ez;
  console.log('#' + i, 'pc=' + d.pc, 'op=' + d.op, 'ez=' + (ez ? ez.t + '/' + ez.len + ' head=' + ez.head.join(',') + ' tail=' + (ez.tail ? ez.tail.join(',') : '') : 'none'), 'pl=' + (d.pl ? d.pl.join(',') : 'none'), 'k.len=' + (d.k ? d.k.length : 0));
});
