// 调试 encryptConfig 缺失字节
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

// 复用 getTree/getEncryptConfig
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
const missing = [];
for (let b = 0; b < 256; b++) {
  if (!encryptConfig[0][b]) missing.push(b);
}
console.log('encryptConfig 缺失字节:', missing, '共', missing.length, '个');
// 检查这些字节的 val
for (const b of missing.slice(0, 5)) {
  console.log(`  byte ${b}:`, encryptConfig[0][b]);
}
process.exit(0);
