const fs = require('fs');
let dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
// 应用同样 patch 后检查 op372
dynCode = dynCode.replace(/!_\$lj\?_\$oL[+\-]=-?\d+:0;/g, '0;');
dynCode = dynCode.replace(/_\$oL\+=-?\d+:0;/g, (m) => {
  const n = parseInt(m.match(/-?\d+/)[0]);
  return n < 0 ? '0;' : m;
});
dynCode = dynCode.replace(/_\$oL\+=-?\d+;/g, (m) => {
  const n = parseInt(m.match(/-?\d+/)[0]);
  return n < 0 ? '0;' : m;
});
// 找所有 '_$jc===372)' 的 handler
let i = 0, n = 0;
while ((i = dynCode.indexOf('_$jc===372)', i)) >= 0 && n < 40) {
  const seg = dynCode.slice(i, i + 80);
  console.log('op372 @' + i + ': ...' + seg);
  i += 10; n++;
}
