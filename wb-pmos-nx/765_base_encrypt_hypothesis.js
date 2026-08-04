/**
 * 765_base_encrypt_hypothesis.js
 * 验证 base 生成假设：
 * 1. base = 明文basearr 经某变换（huffman/加密）+ 固定头
 * 2. 检查 base[68+] 与 cap[68+] 的加密关系（XOR keys2 / encryptMode1/2 / huffman）
 * 3. 用 589 管线把 cap 转 base，与真实 base 对比
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const S = d.samples.filter(s => s.base[26] === 233);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode1, encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

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
function nxEncrypt(numarr) {
  if (!huffEncCfg) huffEncCfg = getEncCfg(getTree());
  const ans = [];
  let one = 0, two = 0;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = huffEncCfg[numarr[i]];
    one = one << cfg.val | cfg.key;
    two += cfg.val;
    while (two >= 8) { ans.push(one >> two - 8); one &= ~(255 << two - 8); two -= 8; }
  }
  if (two > 0) ans.push(one << 8 - two | 0x68 >> two);
  return ans;
}

(async () => {
  const s = S.find(x => x.nsd === 86155);
  const cap = s.cap;
  const base = s.base;
  const k2 = s.keys2;
  console.log('=== 假设测试 nsd=86155 ===');
  console.log('cap len=' + cap.length + ' base len=' + base.length + ' keys2 len=' + k2.length);

  // 假设1：base = huffman(cap)？长度对比
  const huffCap = nxEncrypt(cap);
  console.log('huffman(cap) len=' + huffCap.length + ' vs base len=' + base.length);

  // 假设2：base[68+] = encryptMode2(cap[68:], keys17)? 需要 keys17
  // 假设3：base = cap XOR 固定流？已排除
  // 假设4：cap 与 base 是否有相同的 varint 结构
  console.log('\ncap[0-31]:', cap.slice(0, 32).join(','));
  console.log('base[0-31]:', base.slice(0, 32).join(','));
  console.log('\n=== cap 中 0 位置 ===');
  const capZeros = [];
  for (let i = 0; i < cap.length; i++) if (cap[i] === 0) capZeros.push(i);
  console.log('cap 0@' + capZeros.join(','));
  console.log('base 0@' + [1, 14, 28, 29, 37, 56, 62, 66, 72, 99, 100, 130, 131, 143, 145, 162, 163, 164].join(','));

  // 假设5：base = 内层加密，密钥来自 keys2 或 keys[17]
  // 检查 base[68:84] 与 keys2[0:16] 关系
  console.log('\nbase[68:84]:', base.slice(68, 84).join(','));
  console.log('keys2[0:16]:', k2.slice(0, 16).join(','));
  const xor = base.slice(68, 84).map((v, i) => v ^ k2[i]);
  console.log('XOR:', xor.join(','));
  console.log('XOR 可打印:', xor.map(v => v >= 32 && v < 127 ? String.fromCharCode(v) : '.').join(''));
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
