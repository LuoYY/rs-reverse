/**
 * 42_bruteforce_tail.js
 *
 * 穷举解码 basearr 的尾部字节，使 numarrEncrypt 完全匹配浏览器 numenc
 */
require('module-alias')('.');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

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

function decodeBits(bits) {
  const tree = getTree();
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (!node) break;
    if (node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}

const innerFile = fs.readdirSync(OUT).filter(x => x.startsWith('inner_')).sort().pop();
const inner = JSON.parse(fs.readFileSync(path.join(OUT, innerFile)));
const keys2 = inner.log.find(e => e.idx === 187 && e.args[1] && e.args[1].len === 48).args[1].d;
const realInput = inner.log.find(e => e.idx === 185 && e.args[0] && e.args[0].len === 288).args[0].d;
const numenc = realInput.map((b, i) => i < 16 ? b ^ keys2[i] : b);

// 第一层解码：完整 288B bit 流
let bits = '';
for (const b of numenc) bits += b.toString(2).padStart(8, '0');
const S = decodeBits(bits);
console.log('第一层解码:', S.length, 'B');

// 穷举：修改 S 的尾部（最后 2 字节的组合），使重编码匹配
const target = numenc;
console.log('目标 numenc 尾4:', target.slice(-4).map(b => b.toString(16).padStart(2, '0')).join(' '));

// 尝试：长度 -1 / +0 / +1，修改尾部 1-2 字节
let found = null;
for (let lenDelta = -2; lenDelta <= 2; lenDelta++) {
  const len = S.length + lenDelta;
  if (len < 200) continue;
  // 保留前 len-2 字节，穷举最后 2 字节
  const base = S.slice(0, len - 2);
  for (let v1 = 0; v1 < 256; v1++) {
    for (let v2 = 0; v2 < 256; v2++) {
      const cand = [...base, v1, v2];
      const re = numarrEncrypt([...cand]);
      if (re.length === target.length && re.every((b, i) => b === target[i])) {
        console.log('★★★ 找到! lenDelta=' + lenDelta + ' tail=[' + v1 + ',' + v2 + ']');
        found = cand;
        break;
      }
    }
    if (found) break;
  }
  if (found) break;
}
if (!found) {
  console.log('穷举尾部 2 字节失败，尝试单字节');
  for (let lenDelta = -2; lenDelta <= 2; lenDelta++) {
    const len = S.length + lenDelta;
    const base = S.slice(0, len - 1);
    for (let v1 = 0; v1 < 256; v1++) {
      const cand = [...base, v1];
      const re = numarrEncrypt([...cand]);
      if (re.length === target.length && re.every((b, i) => b === target[i])) {
        console.log('★★★ 找到(单字节)! lenDelta=' + lenDelta + ' tail=[' + v1 + ']');
        found = cand;
        break;
      }
    }
    if (found) break;
  }
}
if (found) {
  console.log('basearr len:', found.length);
  console.log('头部 30:', found.slice(0, 30).join(','));
  fs.writeFileSync(path.join(OUT, 'basearr_exact.json'), JSON.stringify({ basearr: found, numenc, keys2, challenge: inner.challenge }));
  console.log('已保存 captures/basearr_exact.json');
} else {
  console.log('全部失败');
}
