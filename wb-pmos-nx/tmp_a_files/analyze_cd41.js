// 核心攻坚：cd 绑定 41B（pair22 [22:29] + env68 [68:73] + 变体区 [110:137]）
// 28 样本分析：与 cd/keys2/cap 的确定性关系
const data = require('../tmp_b_files/nx_vm_verify_dataset.json');

console.log('=== 样本全览 ===');
data.forEach((s, i) => {
  const b = s.base;
  const p22 = b.slice(22, 29);
  const e68 = b.slice(68, 73);
  const v110 = b.slice(110, 137);
  console.log('#' + i, 'nsd=' + s.nsd, 'blk=' + s.block,
    '[22:29]=' + p22.join(','),
    '[68:73]=' + e68.join(','));
});

// 1. 分组：同 nsd（同 cd？）样本对比
console.log('\n=== 同 nsd 分组 ===');
const groups = {};
data.forEach(s => { (groups[s.nsd] = groups[s.nsd] || []).push(s); });
Object.keys(groups).forEach(nsd => {
  if (groups[nsd].length > 1) {
    console.log('nsd=' + nsd + ' (' + groups[nsd].length + ' 样本):');
    groups[nsd].forEach((s, i) => {
      console.log('  #' + i, 'blk=' + s.block,
        '[22:29]=' + s.base.slice(22, 29).join(','),
        '[68:73]=' + s.base.slice(68, 73).join(','));
    });
  }
});

// 2. 检查 pair22 与 env68/env73 的关系（配对实验结论）
console.log('\n=== pair22/env68/env73 字段 ===');
data.slice(0, 8).forEach((s, i) => {
  console.log('#' + i, 'pair22=' + (s.pair22 || '').toString().slice(0, 40),
    'env68=' + (s.env68 || '').toString().slice(0, 40),
    'env73=' + (s.env73 || '').toString().slice(0, 40));
});

// 3. cd 派生：decryptCd(cd) → ans → keys。检查 [22:29] 是否 = keys 某段
console.log('\n=== [22:29] vs keys2 段 ===');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
function decryptCd(str) { const idxmap = {}; NX_BS.split('').forEach((k, i) => { idxmap[k] = i; }); const ans = []; for (let i = 0; i < str.length; i += 4) { const one = str[i], two = str[i + 1], three = str[i + 2], four = str[i + 3]; if (two) ans.push((idxmap[one] << 2) | (idxmap[two] >> 4)); if (three) ans.push(((idxmap[two] & 15) << 4) | (idxmap[three] >> 2)); if (four) ans.push(((idxmap[three] & 3) << 6) | idxmap[four]); } return ans }
data.slice(0, 5).forEach((s, i) => {
  const cdArr = decryptCd(s.cd);
  const p22 = s.base.slice(22, 29);
  console.log('#' + i, 'cdArr.len=' + cdArr.length, '[22:29]=' + p22.join(','));
});
