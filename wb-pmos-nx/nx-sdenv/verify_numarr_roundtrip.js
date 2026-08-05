// 验证 numarrEncrypt 的逆（numarrDecrypt）往返一致性
const fs = require('fs');
const path = require('path');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

// getTree/codeMap（与 numarrEncrypt 相同）
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
const codeMap = {};
for (let b = 0; b < 256; b++) {
  const c = encryptConfig[0][b];
  if (!c) continue;
  if (!codeMap[c.val]) codeMap[c.val] = {};
  codeMap[c.val][c.key] = b;
}

function numarrDecrypt(numarr) {
  const ans = [];
  let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) {
    const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) {
      const b = (byte >> bit) & 1;
      curKey = (curKey << 1) | b;
      curLen++;
      const m = codeMap[curLen];
      if (m && m[curKey] !== undefined) { ans.push(m[curKey]); curKey = 0; curLen = 0; }
    }
  }
  return ans;
}

(async () => {
  // 不设置 gv.config，numarrEncrypt 用默认 getKey（往返验证 padding 不影响主体）
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const sample = m[1].split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
  console.log('样本 len:', sample.length);

  const enc = numarrEncrypt(sample);
  console.log('numarrEncrypt len:', enc.length);
  const dec = numarrDecrypt(enc);
  console.log('numarrDecrypt(len):', dec.length);
  console.log('往返一致:', dec.length >= sample.length && dec.slice(0, sample.length).join(',') === sample.join(','));
  if (dec.length !== sample.length) {
    console.log('差异（dec 比 sample 多）:', dec.slice(sample.length).join(','));
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
