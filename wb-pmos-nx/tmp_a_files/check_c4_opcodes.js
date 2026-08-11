// 检查 _$c4 中不同 opcode 的实际代码（op=620 vs 405 vs 611）
const fs = require('fs');
const code = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
console.log('_$c4 len:', code.length);

// 找 op=620 相关（_$pW 比较）
function findOp(op) {
  // opcode 分派用 if(_$pW===N) 或比较
  const patterns = [
    `_$pW===${op}){`,
    `_$pW<${op}){`,
    `_$pW>${op}){`,
  ];
  for (const p of patterns) {
    const idx = code.indexOf(p);
    if (idx >= 0) return { pat: p, idx, ctx: code.slice(idx - 20, idx + 100) };
  }
  return null;
}
[620, 812, 393, 405, 611, 1493].forEach(op => {
  const r = findOp(op);
  console.log('\nop=' + op + ': ' + (r ? r.pat + ' @' + r.idx + ' → ' + r.ctx.replace(/\n/g, ' ') : '未找到'));
});

// 找语义树怎么提取的：看 op=620 的分支
console.log('\n=== 搜索 _$pW===620 或类似 ===');
// 语义树 sem[620] = "_$ez=_$ez[_$oU[33]](0)" 
// 实际 c4 里可能：if(_$pW===620){_$ez=_$ez[_$oU[33]](0);}
const m = code.match(/_\$pW===620\)\{[^}]*\}/);
console.log(m ? m[0] : '未找到 _$pW===620');
