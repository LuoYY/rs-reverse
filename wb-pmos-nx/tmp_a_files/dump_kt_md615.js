// dump _$kt（base 关键常量数组）+ _$mD[615]（base 生成函数）
const fs = require('fs');
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const k0 = tables._$k0.val;
const mD = tables._$mD.val; // 环境函数池
console.log('_$k0 len:', k0.length);
console.log('_$mD len:', mD.length);

// _$kt 索引（从执行流 #381）
const ktIdx = [41, 116, 122, 40, 41, 22, 34, 53, 174, 121, 83, 65]; // 从 op=172 截取
console.log('\n_$kt 索引:', ktIdx.join(','));
console.log('_$kt 值:', ktIdx.map(i => k0[i]).join(','));
// 完整 _$kt（看 op=172 的完整列表）
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const m = c4.match(/_\$pW===172\)\{([^}]*)\}/);
if (m) {
  console.log('\nop=172 完整:', m[1].slice(0, 300));
  const idxs = m[1].match(/_$k0\[(\d+)\]/g) || [];
  console.log('_$kt 索引(' + idxs.length + '):', idxs.join(','));
  const vals = idxs.map(x => k0[+x.match(/\d+/)[0]]);
  console.log('_$kt 值(' + vals.length + '):', vals.join(','));
}

// _$mD[615] 是什么？
console.log('\n_$mD[615]:', JSON.stringify(mD[615]).slice(0, 200));
// _$mD[23]（时间戳函数）
console.log('_$mD[23]:', JSON.stringify(mD[23]).slice(0, 100));
