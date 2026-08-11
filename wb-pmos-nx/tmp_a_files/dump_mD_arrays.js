// dump _$mD[615] 调用的完整数组，对比 ktFinal
const calls = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_mD_calls.json');
const ktFinal = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_kt_final.json');

// #0: ez=1024 → 230B
const a0 = calls[0].after;
console.log('#0 ez=1024 pl=' + calls[0].pl + ' len=' + a0.length);
console.log('head:', a0.slice(0, 40).join(','));
console.log('tail:', a0.slice(-20).join(','));

// #1: ez=128 → 128B
const a1 = calls[1].after;
console.log('\n#1 ez=128 pl=' + calls[1].pl + ' len=' + a1.length);
console.log('head:', a1.slice(0, 40).join(','));
console.log('tail:', a1.slice(-20).join(','));

// 对比 a1 与 a2（不同 pl，是否不同）
const a2 = calls[2].after;
let diff12 = 0;
for (let i = 0; i < 128; i++) if (a1[i] !== a2[i]) diff12++;
console.log('\n#1 vs #2 差异字节数:', diff12, '(不同 pl)');
if (diff12 < 10) {
  for (let i = 0; i < 128; i++) if (a1[i] !== a2[i]) console.log('  @' + i + ': ' + a1[i] + ' vs ' + a2[i]);
}

// 对比 a1 与 ktFinal 的某部分
console.log('\na1 vs ktFinal[65:] 前 128 字节匹配:');
let m = 0;
for (let i = 0; i < 128; i++) if (ktFinal[65 + i] === a1[i]) m++;
console.log('  匹配:', m + '/128');

// a0(230) vs ktFinal(209) 对比
console.log('\na0 vs ktFinal 匹配:');
m = 0;
for (let i = 0; i < Math.min(209, a0.length); i++) if (ktFinal[i] === a0[i]) m++;
console.log('  匹配:', m + '/209');
// 差异位置
const diffs = [];
for (let i = 0; i < Math.min(209, a0.length); i++) if (ktFinal[i] !== a0[i]) diffs.push(i);
console.log('  差异位置(' + diffs.length + '):', diffs.slice(0, 30).join(','));

// 3 轮是否完全一致
console.log('\n3 轮一致性:');
const r0 = calls.slice(0, 18), r1 = calls.slice(18, 36), r2 = calls.slice(36, 50);
function sameArr(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
for (let i = 0; i < 18; i++) {
  const eq1 = r1[i] && r0[i] && sameArr(r1[i].after, r0[i].after);
  const eq2 = r2[i] && r0[i] && sameArr(r2[i].after, r0[i].after);
  console.log('  #' + i + ' (ez=' + r0[i].ez + ' pl=' + r0[i].pl + '): r1同=' + eq1 + ' r2同=' + eq2);
}
