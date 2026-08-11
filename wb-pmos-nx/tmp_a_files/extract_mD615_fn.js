// 提取 _$mD[615] 函数（编码器）的实现
const fs = require('fs');
// 1) 从 tables_init 看
try {
  const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
  console.log('tables keys:', Object.keys(t));
  const mD = t._$mD;
  if (mD) {
    console.log('_$mD type:', typeof mD, Array.isArray(mD) ? 'len=' + mD.length : '');
    const v = Array.isArray(mD) ? mD : (mD.val || mD);
    if (Array.isArray(v) && v[615]) {
      console.log('_$mD[615]:', typeof v[615], JSON.stringify(v[615]).slice(0, 300));
    } else {
      console.log('_$mD[615] 不可用，v len=', v.length);
      // 打印 615 附近
      console.log('_$mD[610:620]:', JSON.stringify(v.slice(610, 620)).slice(0, 500));
    }
  }
} catch (e) { console.log('tables_init 读取失败:', e.message); }
// 2) 从 dynCode 搜索 _$mD[615] 的赋值（可能是运行时）
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
console.log('\n=== dynCode 中 mD[615] 相关 ===');
let i = 0, n = 0;
while ((i = c.indexOf('615', i)) >= 0 && n < 30) {
  const ctx = c.slice(Math.max(0, i - 15), i + 15);
  if (ctx.includes('mD') || ctx.includes(']615')) {
    console.log('@' + i + ': ...' + c.slice(i - 40, i + 40));
  }
  i += 3; n++;
}
