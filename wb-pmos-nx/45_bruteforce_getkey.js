/**
 * 45_bruteforce_getkey.js
 *
 * 穷举 nx 的 getKey（padding 常量），使 numarrEncrypt(basearr) == browserNumenc
 * 若只有 getKey 不同（前 287 字节一致已验证），穷举 256 值即可
 */
require('module-alias')('.');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

// 复制 numarrEncrypt 树与码表
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
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else {
    arr[tree.idx] = config;
  }
  return arr;
}
function getKeyFromCodes(codes) {
  for (let idx in codes) {
    if (codes[idx].val >= 8) {
      return codes[idx].key >> (codes[idx].val - 8);
    }
  }
}
const CODES = getEncryptConfig(getTree());
const pipeGetKey = getKeyFromCodes(CODES);
console.log('管线 getKey:', pipeGetKey.toString(16), '=', pipeGetKey);

// 带 getKey 的编码器
function encryptWithKey(numarr, getKey) {
  const ans = [];
  let one = 0, two = 0;
  for (let i = 0; i < numarr.length; i++) {
    const cfg = CODES[numarr[i]];
    one = (one << cfg.val) | cfg.key;
    two += cfg.val;
    while (two >= 8) {
      ans.push((one >> (two - 8)) & 255);
      one &= ~(255 << (two - 8));
      two -= 8;
    }
  }
  if (two > 0) {
    ans.push(((one << (8 - two)) | (getKey >> two)) & 255);
  }
  return ans;
}

// 读取数据
const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
const realInput = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288).args[0].d;
const numenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);
// basearr303（解码）
const dec = JSON.parse(fs.readFileSync(path.join(OUT, 'basearr_decoded.json')));
const basearr303 = dec.basearr;

console.log('basearr303 len:', basearr303.length);
console.log('browserNumenc 尾3:', numenc.slice(-3).map(b => b.toString(16).padStart(2, '0')).join(' '));

// 穷举 getKey 0-255
let found = null;
for (let gk = 0; gk < 256; gk++) {
  const enc = encryptWithKey(basearr303, gk);
  if (enc.length === numenc.length && enc.every((b, i) => b === numenc[i])) {
    console.log('★★★ getKey =', gk.toString(16), '(', gk, ') 完美匹配!');
    found = gk;
    break;
  }
  // 快速检查：如果前287字节不匹配则跳过（优化已由局部性保证）
}
if (!found) {
  console.log('穷举 0-255 无匹配');
  // 检查前 287 字节匹配情况（确认只有尾部差异）
  const enc = encryptWithKey(basearr303, pipeGetKey);
  let diffCount = 0;
  for (let i = 0; i < Math.min(enc.length, numenc.length); i++) if (enc[i] !== numenc[i]) diffCount++;
  console.log('管线 getKey 编码差异字节数:', diffCount);
  console.log('enc 尾3:', enc.slice(-3).map(b => b.toString(16)).join(' '), 'vs target', numenc.slice(-3).map(b => b.toString(16)).join(' '));
}
