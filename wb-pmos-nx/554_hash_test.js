/**
 * 554_hash_test.js
 * 尝试绑定字节 [26-29]/[84-87] = hash(keys组合) 的某段
 */
const fs = require('fs');
const crypto = require('crypto');

const data = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

function tryMatch(label, hashBuf, targets) {
  for (let t = 0; t < targets.length; t++) {
    const target = targets[t];
    for (let s = 0; s <= hashBuf.length - 4; s++) {
      if (JSON.stringify(hashBuf.slice(s, s + 4)) === JSON.stringify(target)) {
        console.log(`★ ${label} [${s}-${s + 3}] == ${t === 0 ? '[26-29]' : '[84-87]'}`);
      }
    }
  }
}

for (let i = 0; i < data.length; i++) {
  const d = data[i];
  const dyn26 = d.basearr.slice(26, 30);
  const dyn84 = d.basearr.slice(84, 88);
  console.log(`\nS${i + 1}: [26-29]=${dyn26.map(x => x.toString(16).padStart(2, '0')).join(' ')} [84-87]=${dyn84.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  const targets = [dyn26, dyn84];

  // 各种 keys 组合
  const k2 = Buffer.from(d.keys[2]);
  const k17 = Buffer.from(d.keys[17]);
  const k19 = Buffer.from(d.keys[19] || []);
  const allKeys = Buffer.concat(d.keys.map(k => Buffer.from(k || [])));
  const combos = {
    'md5(k2+k17)': crypto.createHash('md5').update(Buffer.concat([k2, k17])).digest(),
    'md5(k17+k2)': crypto.createHash('md5').update(Buffer.concat([k17, k2])).digest(),
    'md5(allkeys)': crypto.createHash('md5').update(allKeys).digest(),
    'sha1(k2+k17)': crypto.createHash('sha1').update(Buffer.concat([k2, k17])).digest(),
    'sha1(allkeys)': crypto.createHash('sha1').update(allKeys).digest(),
    'sha256(k2+k17)': crypto.createHash('sha256').update(Buffer.concat([k2, k17])).digest(),
    'sha256(allkeys)': crypto.createHash('sha256').update(allKeys).digest(),
    'md5(k17)': crypto.createHash('md5').update(k17).digest(),
    'md5(k2)': crypto.createHash('md5').update(k2).digest(),
    'md5(k19)': crypto.createHash('md5').update(k19).digest(),
    'md5(k2+k19)': crypto.createHash('md5').update(Buffer.concat([k2, k19])).digest(),
    'md5(k17+k19)': crypto.createHash('md5').update(Buffer.concat([k17, k19])).digest(),
  };
  for (const [name, buf] of Object.entries(combos)) {
    tryMatch(name, buf, targets);
  }
  // 动态段自身 hash
  tryMatch('md5(dyn26+dyn84)', crypto.createHash('md5').update(Buffer.from(dyn26.concat(dyn84))).digest(), targets);
  // keys24 (flag)
  if (d.keys[24]) {
    const k24 = Buffer.from(d.keys[24]);
    tryMatch('md5(k2+k24)', crypto.createHash('md5').update(Buffer.concat([k2, k24])).digest(), targets);
  }
}
console.log('\n完成');
