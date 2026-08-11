const fs = require('fs');
const t = JSON.parse(fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/anchor_analysis_files/nx_vm_tables_init.json', 'utf8'));
console.log('tables keys:', Object.keys(t).join(','));
for (const k of Object.keys(t)) {
  const v = t[k];
  if (Array.isArray(v)) console.log('  ' + k + ' = array[' + v.length + '] head=' + v.slice(0, 5).join(','));
  else if (typeof v === 'object') console.log('  ' + k + ' = object ' + JSON.stringify(v).slice(0, 60));
  else console.log('  ' + k + ' = ' + v);
}
