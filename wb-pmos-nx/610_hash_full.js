/**
 * 610_hash_full.js
 * 完整 hash 测试：绑定字节 [25-28] vs keys 组合的 MD5/SHA1/SHA256/CRC32
 * 覆盖：keys 各种拼接 + 各种截断（前4/后4/中4/异或）
 */
const fs = require('fs');
const crypto = require('crypto');

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

function crc32b(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c >>> 0;
}
function BE4(arr) { return arr.reduce((a, x) => a * 256 + x, 0); }
function LE4(arr) { return arr.reduce((a, x, i) => a + (x << (8 * i)), 0) >>> 0; }

// 目标
const targets = d.map(x => ({ b25: BE4(x.basearr.slice(25, 29)), b84: BE4(x.basearr.slice(84, 88)), b25le: LE4(x.basearr.slice(25, 29)), b84le: LE4(x.basearr.slice(84, 88)) }));
console.log('目标 [25-28]BE:', targets.map(t => t.b25).join(','));
console.log('目标 [84-87]BE:', targets.map(t => t.b84).join(','));

// keys 输入构造
const inputs = [];
const k = d[0].keys;
// keys 拼接的各种组合
for (let i = 0; i < k.length; i++) {
  if (!k[i]) continue;
  inputs.push(['k' + i, Buffer.from(k[i])]);
  for (let j = i + 1; j < k.length; j++) {
    if (!k[j]) continue;
    inputs.push(['k' + i + '+k' + j, Buffer.from([...k[i], ...k[j]])]);
  }
}
// keys22 + keys16
inputs.push(['k22+k16', Buffer.from([...k[22], ...k[16]])]);
inputs.push(['k16+k22', Buffer.from([...k[16], ...k[22]])]);
inputs.push(['k22', Buffer.from(k[22])]);
inputs.push(['k19+k21', Buffer.from([...k[19], ...k[21]])]);
inputs.push(['k2+k17', Buffer.from([...k[2], ...k[17]])]);

// 对每个输入算多种 hash，检查是否匹配目标（跨会话）
function check(name, hashFn) {
  const vals = d.map(x => {
    const buf = Buffer.from(hashFn(x));
    return { BE: BE4(buf.slice(0, 4)), LE: LE4(buf.slice(0, 4)), BE2: BE4(buf.slice(-4)), tail: LE4(buf.slice(-4)) };
  });
  // 检查所有会话是否匹配（绑定字节跨会话变，hash 也变）
  for (let t = 0; t < 2; t++) {
    if (vals[t].BE === targets[t].b25 && vals[1].BE === targets[1].b25) {
      console.log(`★★ [25-28] = ${name} BE 全会话匹配!`);
    }
    if (vals[t].LE === targets[t].b25le && vals[1].LE === targets[1].b25le) {
      console.log(`★★ [25-28] = ${name} LE 全会话匹配!`);
    }
    if (vals[t].BE2 === targets[t].b25 && vals[1].BE2 === targets[1].b25) {
      console.log(`★★ [25-28] = ${name} 尾4BE 全会话匹配!`);
    }
    if (vals[t].tail === targets[t].b84 && vals[1].tail === targets[1].b84) {
      console.log(`★★ [84-87] = ${name} 尾4LE 全会话匹配!`);
    }
  }
}

for (const [name, buf] of inputs) {
  const hashTypes = {
    'md5': (b) => crypto.createHash('md5').update(b).digest(),
    'sha1': (b) => crypto.createHash('sha1').update(b).digest(),
    'sha256': (b) => crypto.createHash('sha256').update(b).digest(),
    'crc32': (b) => { const v = crc32b(b); return [v >>> 24, v >>> 16 & 255, v >>> 8 & 255, v & 255]; },
  };
  for (const [hn, hf] of Object.entries(hashTypes)) {
    check(name + ':' + hn, (x) => hf(Buffer.from(inputs.find(i => i[0] === name)[1])));
  }
}
console.log('完成');
