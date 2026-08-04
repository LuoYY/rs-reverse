/**
 * 930_diag_tables_full.js
 * 系统性诊断：表文件有效性 + sandbox 赋值 + vm 中访问
 */
const fs = require('fs');
const vm = require('vm');

// 1. 检查表文件
console.log('=== 1. 表文件 ===');
const tables196 = JSON.parse(fs.readFileSync('/tmp/nx_tables_196_merged.json', 'utf8'));
console.log('tables196 keys:', Object.keys(tables196).join(', '));
Object.keys(tables196).forEach(k => {
  const v = tables196[k];
  console.log('  ' + k + ': array len=' + v.length + ' [0]=' + JSON.stringify(v[0]) + ' [88]=' + JSON.stringify(v[88]));
});

// 2. 检查 sandbox 赋值
console.log('\n=== 2. sandbox 赋值 ===');
const sandbox = { console };
sandbox._$oU = tables196._$oU;
sandbox._$b1 = tables196._$b1;
sandbox._$lc = tables196._$lc;
sandbox._$oP = tables196._$oP;
sandbox._$f$ = tables196._$f$;
sandbox._$lC = tables196._$lC;
sandbox._$ll = tables196._$ll;
console.log('sandbox._$oU:', typeof sandbox._$oU, sandbox._$oU && sandbox._$oU.length);

// 3. vm 中访问
console.log('\n=== 3. vm 中访问 ===');
vm.createContext(sandbox);
vm.runInContext(`
  console.log('vm 中 globalThis._$oU:', typeof globalThis._\$oU, globalThis._\$oU && globalThis._\$oU[88]);
  console.log('vm 中 _$oU:', typeof _$oU, _$oU && _$oU[88]);
`, sandbox);

// 4. 检查 IIFE 注入模式（var 提升问题）
console.log('\n=== 4. IIFE 注入模式 ===');
vm.runInContext(`
  (function(){
    // 模拟 IIFE 注入
    var _$oU = globalThis._\$oU;
    console.log('IIFE 内 var _$oU:', typeof _$oU, _$oU && _$oU[88]);
    // 但如果 IIFE 内部有 var _$oU 提升（后面声明），会覆盖
    // 模拟：IIFE 深层有 var _$oU
    var _$oU2; // 如果 var 提升，_$oU 会是 undefined
  })();
`, sandbox);

// 5. 关键：检查 body_full 的注入是否在正确位置
console.log('\n=== 5. body_full 注入位置 ===');
const body = fs.readFileSync('/tmp/nx_vm_body_full.js', 'utf8');
const vIdx = body.indexOf('var _$oU');
console.log('var _$oU @', vIdx);
console.log('IIFE 开头:', body.substring(0, 100));
console.log('注入上下文:', body.substring(vIdx - 30, vIdx + 40));