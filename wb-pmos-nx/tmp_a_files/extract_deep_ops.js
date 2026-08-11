// 深度提取深层 opcode 语义（2131/1842/2137/2139/1601 等）
const fs = require('fs');
const c4 = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_c4_full.js', 'utf8');
const tables = require('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json');
const ou = tables._$oU.val, k0c = tables._$k0.val;
function resolve(code) {
  let c = code.replace(/_$oU\[(\d+)\]/g, (mm, i) => ou[+i] !== undefined ? JSON.stringify(ou[+i]) : mm);
  c = c.replace(/_$k0\[(\d+)\]/g, (mm, i) => k0c[+i] !== undefined ? String(k0c[+i]) : mm);
  return c;
}

// 用括号匹配提取 opcode 完整分支（处理嵌套）
function extractOp(op) {
  // 找 "_$pW===op){" 位置
  const key = '_$pW===' + op + '){';
  const idx = c4.indexOf(key);
  if (idx < 0) return null;
  let depth = 0, end = -1;
  for (let i = idx + key.length; i < c4.length; i++) {
    if (c4[i] === '{') depth++;
    else if (c4[i] === '}') { if (depth === 0) { end = i + 1; break; } depth--; }
  }
  return c4.slice(idx + key.length, end - 1);
}
[2131, 1842, 2137, 2139, 1601, 1582, 1845, 1846, 1847, 1848, 1849].forEach(op => {
  const body = extractOp(op);
  console.log('=== op=' + op + ' ===');
  console.log(body ? resolve(body).replace(/\s+/g, ' ').slice(0, 400) : 'N/A');
  console.log();
});
