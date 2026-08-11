// 纯 Node 重建 JSVMP tokenizer：注入所有闭包常量，运行 _$h7 工厂解码 gS → token 流
// 资产：fn__$h7.txt（工厂）+ tables_init（_$k0/_$oU/_$b1/_$lc/_$f$/_$mD）+ f3/np（已提取）+ gS（nx_md_states）
const fs = require('fs');
const path = require('path');

// 1. 加载 tables
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
const k0 = t._$k0.val || t._$k0;
const oU = t._$oU.val || t._$oU;
const b1 = t._$b1.val || t._$b1;
const lc = t._$lc.val || t._$lc;
const f$ = (t._$f$ && t._$f$.val) || t._$f$;
const mD = t._$mD.val || t._$mD;

// 打印关键常量
console.log('_$k0[6]=' + k0[6], '_$k0[38]=' + k0[38], '_$k0[33]=' + k0[33], '_$k0[49]=' + k0[49], '_$k0[15]=' + k0[15], '_$k0[50]=' + k0[50]);
console.log('_$k0[51]=' + k0[51], '_$k0[5]=' + k0[5], '_$k0[18]=' + k0[18], '_$k0[59]=' + k0[59]);
console.log('_$oU[17]=' + JSON.stringify(oU[17]), '_$oU[43]=' + JSON.stringify(oU[43]), '_$oU[96]=' + JSON.stringify(oU[96]), '_$oU[6]=' + JSON.stringify(oU[6]));
console.log('_$b1[12]=' + JSON.stringify(b1[12]), '_$b1[14]=' + JSON.stringify(b1[14]), '_$b1[23]=' + JSON.stringify(b1[23]), '_$b1[144]=' + JSON.stringify(b1[144]));
console.log('_$lc[57]=' + JSON.stringify(lc[57]), '_$lc[92]=' + JSON.stringify(lc[92]), '_$lc[150]=' + JSON.stringify(lc[150]));
console.log('_$f$[169]=' + (f$ ? JSON.stringify(f$[169]) : 'N/A'));
console.log('_$mD 类型:', typeof mD, Array.isArray(mD) ? 'arr len=' + mD.length : '');
// mD 里的方法名（第 4/15/61/62 索引）
if (Array.isArray(mD)) {
  for (const i of [4, 15, 61, 62]) {
    console.log('_$mD[' + i + ']:', typeof mD[i] === 'string' ? JSON.stringify(mD[i]) : typeof mD[i]);
  }
}

// 2. 检查 _\$gL 类（值对象）——不在 tables，需从 dynCode 提取
const dyn = fs.readFileSync(path.join(__dirname, 'nx_dynCode_full_patched.js'), 'utf8');
const gLIdx = dyn.indexOf('function _$gL(');
console.log('\n_$gL 定义 @' + gLIdx + ':', gLIdx >= 0 ? dyn.slice(gLIdx, gLIdx + 300) : '未找到');
