/**
 * 728_A219_rebuild_roundtrip.js
 * 验证重建链路往返一致性（离线，用已保存的 base）：
 * 检查 huff（浏览器编码）vs numarrEncrypt68(base)（重建编码）是否一致
 * 若编码一致 → 重建链路正确，修改段后 412 = 服务器校验
 * 若编码不一致 → 重建链路 bug
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) { if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; } }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getEncCfg(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncCfg(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncCfg(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else arr[tree.idx] = config;
  return arr;
}
let huffEncCfg = null;
function numarrEncrypt68(numarr, padVal) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  const len = numarr.length;
  let one = 0, two = 0;
  const pad = padVal === undefined ? 0x68 : padVal;
  for (let i = 0; i < len; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | pad >> two);
  return ans;
}

// 从 A216 的保存数据获取 huff（如果存在）
const fixed = JSON.parse(fs.readFileSync('/tmp/nx_fixed_nsd_stability.json', 'utf8'));
console.log('固定 nsd 数据 base:');
for (const r of fixed) {
  const b = r.basearr;
  console.log(`run${r.run}: len=${b.length} [24-25]=${b.slice(24, 26).map(x => x.toString(16).padStart(2, '0')).join(' ')} [26-31]=${b.slice(26, 32).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}

// 测试不同 pad 下编码长度
const b = fixed[1].basearr;
console.log('\n=== numarrEncrypt68(base) 编码长度（不同 pad）===');
for (const pad of [0x68, 0xb8, 0x00, 0x88, 0x28]) {
  const enc = numarrEncrypt68(b, pad);
  console.log(`pad=0x${pad.toString(16)}: enc len=${enc.length} 前16=${enc.slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
}

// 说明：浏览器原始 huff 未保存。从 A216 输出看 base len=165/166 且重建后 cookie len=343
// 浏览器原始 P cookie len 也是 343（A215 标准环境 P len=343）
// 但 base1(167) vs base2(163) 长度不同 → 说明 bestLen 判定在两次运行不同！
console.log('\n=== 关键观察 ===');
console.log('base 长度不固定(163-167): 可能 base 内部含变长数据段(如 r2mka/时间戳变长)');
console.log('或 bestLen 判定不稳定(依赖 huff 尾部匹配)');
