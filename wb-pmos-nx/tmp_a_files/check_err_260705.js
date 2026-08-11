const c = require('fs').readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 应用 patch 后定位 260705
let dyn = c;
dyn = dyn.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
dyn = dyn.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
  const n = parseInt(m.match(/-?\d+/)[0]);
  return n < 0 ? '0;' : m;
});
dyn = dyn.replace(/_\$oL\+=-?\d+;/g, (m) => {
  const n = parseInt(m.match(/-?\d+/)[0]);
  return n < 0 ? '0;' : m;
});
dyn = dyn.split('_$lj= !_$c7[_$oP[75]];').join('_$lj=0;');
console.log('260705 处:', dyn.slice(260600, 260800));
// 向后找 concat 出现
let i = dyn.indexOf('concat', 260000);
console.log('\nconcat @' + i + ': ...' + dyn.slice(i - 100, i + 60));
