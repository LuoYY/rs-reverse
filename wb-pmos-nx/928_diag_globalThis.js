/**
 * 928_diag_globalThis.js
 * 终极诊断：vm context 中 globalThis._\$oU 是否可访问
 * 关键：sandbox._\$oU 设置后，IIFE 内 globalThis._\$oU 应能访问
 */
const fs = require('fs');
const vm = require('vm');

const tables196 = JSON.parse(fs.readFileSync('/tmp/nx_tables_196_merged.json', 'utf8'));

const sandbox = { console };
sandbox._$oU = tables196._$oU;
sandbox._$b1 = tables196._$b1;
sandbox._$lc = tables196._$lc;
sandbox._$oP = tables196._$oP;
sandbox._$f$ = tables196._$f$;
sandbox._$lC = tables196._$lC;
sandbox._$ll = tables196._$ll;
sandbox.window = sandbox;

vm.createContext(sandbox);

console.log('=== 诊断 globalThis 访问 ===');
vm.runInContext(`
  console.log('globalThis === window:', globalThis === window);
  console.log('globalThis._$oU:', typeof globalThis._\$oU, globalThis._\$oU && globalThis._\$oU[88]);
  console.log('_$oU:', typeof _$oU, _$oU && _$oU[88]);
  console.log('window._$oU:', typeof window._\$oU, window._\$oU && window._\$oU[88]);
  console.log('globalThis keys 含 _$oU:', Object.keys(globalThis).includes('_\$oU'));
`, sandbox);

// 测试 IIFE 注入模式
console.log('\n=== 测试 IIFE 注入 ===');
vm.runInContext(`
  (function(_$$5, _$lP){
    var window = globalThis;
    var _$oU = globalThis._\$oU;
    console.log('IIFE内 _$oU:', typeof _$oU, _$oU && _$oU[88]);
  })();
`, sandbox);