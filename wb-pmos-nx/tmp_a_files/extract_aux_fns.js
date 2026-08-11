// 提取 _$c8（空白表）+ 确认 _$oU[9]（indexOf）
const fs = require('fs');
const c = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_full_patched.js', 'utf8');
let i = c.indexOf('_$c8=[');
if (i < 0) i = c.indexOf('_$c8 =[');
console.log('_$c8= @' + i);
if (i >= 0) {
  let depth = 0, end = -1;
  for (let j = c.indexOf('[', i); j < c.length; j++) {
    if (c[j] === '[') depth++;
    else if (c[j] === ']') { depth--; if (depth === 0) { end = j; break; } }
  }
  console.log('_$c8:', c.slice(i, end + 1));
}
// _$oU[9]
const t = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const oU = t._$oU.val || t._$oU;
console.log('_$oU[9] =', JSON.stringify(oU[9]));
console.log('_$oU[81] =', JSON.stringify(oU[81]));
// 完整确认 _$pu/_$ad 引用（h7 里还用了哪些）
const h7 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/fn__$h7.txt', 'utf8');
const refs = new Set();
const re = /\$(\w+)/g; let m;
while ((m = re.exec(h7))) {
  const name = '$' + m[1];
  if (name.startsWith('$') && !['_$k6','_$hZ','_$nD','_$oA','_$jM','_$eg','_$p_','_$_T','_$f1','_$k0','_$oU','_$b1','_$lc','_$f$','_$mD','_$np','_$f3','_$ie','_$mT','_$cD','_$gL','_$ll','_$_L','_$$q','_$$M','_$oP','_$kP','_$pE','_$dt','_$_4','_$$m','_$fX','_$ce','_$iR','_$cS','_$er','_$md','_$pc','_$oi','_$_R','_$gx','_$gB','_$hr','_$kx','_$hi','_$ms','_$fZ','_$p2','_$$6','_$kp','_$op','_$mX','_$_c','_$oH','_$$u','_$_8','_$lZ','_$kc','_$_q','_$fU','_$aa','_$_E','_$_m','_$hk','_$ls','_$hP','_$pC','_$aq','_$_T','_$hr'].includes(name)) {
    refs.add(name);
  }
}
console.log('\nh7 其他引用:', [...refs]);
