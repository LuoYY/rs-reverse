/**
 * 728_cap_vs_be.js
 * 对比 cap(CDP捕获) 与 be(原始加密段)/base(589解码)/huff
 */
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8'));
const samples = data.samples;

const ROOT = '/Users/luoyy/work/github/GitHub/rs-reverse_glm';
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require(path.join(ROOT, 'src/handler/parser/constData')).init();
const { encryptMode2 } = require(path.join(ROOT, 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(ROOT, 'src/handler/parser/common/numarrAddTime'));

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

const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

for (const s of samples) {
  // be → huff (589: encryptMode2(keys17) + XOR keys2 first16)
  // 但这里没有 keys17，直接用 keys2 部分检查
  // 先看 be 前 16 是否 = nxEncrypt(cap)[0:16] ^ keys2
  const encCap = nxEncrypt(s.cap);
  const be = s.be;
  console.log(`\nnsd=${s.nsd}:`);
  console.log(`  be len=${be.length} base len=${s.base.length} cap len=${s.cap.length}`);
  console.log(`  be[0:16]=${be.slice(0, 16).join(',')}`);
  console.log(`  encCap[0:16]=${encCap.slice(0, 16).join(',')}`);
  console.log(`  keys2[0:16]=${s.keys2.slice(0, 16).join(',')}`);
  // be[0:16] ^ keys2 == encCap[0:16]?
  const xor = be.slice(0, 16).map((v, i) => v ^ s.keys2[i]);
  const match = xor.every((v, i) => v === encCap[i]);
  console.log(`  be^keys2 == encCap[0:16]? ${match}`);
  if (!match) {
    console.log(`  be^keys2=${xor.join(',')}`);
  }
  // cap 本身与 base 是否一致（长度不同则看前缀）
  const n = Math.min(s.cap.length, s.base.length);
  let same = 0;
  for (let i = 0; i < n; i++) if (s.cap[i] === s.base[i]) same++;
  console.log(`  cap vs base 前缀相同: ${same}/${n}`);
}
