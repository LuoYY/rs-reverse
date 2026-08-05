// 手动复现 numarrEncrypt 找报错字节
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));

function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getKey(arr) {
  for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; }
}
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}
const encryptConfig = getEncryptConfig(getTree());
const cfg = encryptConfig[0];
// 样本
const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
const sample = m[1].split(',').map(x => parseInt(x.trim()));
// 找 undefined
for (const b of sample) {
  if (!cfg[b]) console.log('undefined byte:', b);
}
// 检查 cfg 结构
console.log('cfg[0]:', JSON.stringify(cfg[0]));
console.log('cfg[1]:', JSON.stringify(cfg[1]));
console.log('cfg[253]:', JSON.stringify(cfg[253]));
console.log('cfg[254]:', JSON.stringify(cfg[254]));
console.log('cfg[255]:', JSON.stringify(cfg[255]));
process.exit(0);
