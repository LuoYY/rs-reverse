/**
 * 653_keys_compare.js
 * 对比浏览器 keys2 vs Node 派生 keys[2]，判断 keys 是否纯计算
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
try { require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package)); } catch (e) {}

const d = JSON.parse(fs.readFileSync('/tmp/nx_633_data.json', 'utf8'));

// 535 数据集 keys
const d535 = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
console.log('=== 535 数据集（Node 派生 keys）===');
for (let i = 0; i < 3; i++) {
  const nodeKeys = d535[i].keys;
  console.log(`S${i + 1}: keys[19]=${String.fromCharCode(...nodeKeys[19])} keys[21]=${String.fromCharCode(...nodeKeys[21])} keys[22]=${String.fromCharCode(...nodeKeys[22]).substring(0, 20)}`);
}

// 633 数据
console.log('\n=== 633（同 nsd/cd jsdom + 浏览器）===');
console.log('Node keys[19]:', String.fromCharCode(...d.keys[19]));
console.log('Node keys[21]:', String.fromCharCode(...d.keys[21]));
console.log('Node keys[22]:', String.fromCharCode(...d.keys[22]).substring(0, 20));

const bB = d.bB, jArr = d.jArr;
console.log('\nB [25-28]:', bB.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('J [25-28]:', jArr.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('\njsdom 和浏览器 [25-28] 不同:', JSON.stringify(bB.slice(25, 29)) !== JSON.stringify(jArr.slice(25, 29)));

// 对比 633 Node keys 与 535 各会话 keys 的差异（不同 nsd/cd）
console.log('\n=== Node keys 跨会话对比 ===');
for (let i = 0; i < 3; i++) {
  const nk = d535[i].keys;
  console.log(`S${i + 1} vs 633: keys19=${String.fromCharCode(...nk[19])} vs ${String.fromCharCode(...d.keys[19])}, keys22 相同=${String.fromCharCode(...nk[22]) === String.fromCharCode(...d.keys[22])}`);
}
