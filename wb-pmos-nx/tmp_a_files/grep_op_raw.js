// 在 c4 源码中搜索 opcode 2131/1842/2137/2139 的原始出现（含上下文）
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
[2131, 1842, 2137, 2139, 1582, 1601, 1593, 2128, 2141, 2144].forEach(op => {
  const pats = [
    `_$pW===${op}){`,
    `_$pW<${op}){`,
    `_$pW>${op}){`,
    `${op})`,
  ];
  let found = null;
  for (const p of pats) {
    const idx = c4.indexOf(p);
    if (idx >= 0) { found = { p, idx }; break; }
  }
  if (found) {
    console.log('op=' + op + ' (' + found.p + ') @' + found.idx + ':');
    console.log('  ...' + c4.slice(found.idx - 30, found.idx + 120).replace(/\n/g, ' ') + '...');
  } else {
    console.log('op=' + op + ': 未找到');
  }
  console.log();
});
