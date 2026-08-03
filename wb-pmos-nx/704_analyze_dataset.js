/**
 * 704_analyze_dataset.js
 * 离线分析完整数据集：basearr[25-28] 与 keys/环境指纹段的加密关系
 */
const fs = require('fs');
const crypto = require('crypto');

const d = JSON.parse(fs.readFileSync('/tmp/nx_full_dataset_75735.json', 'utf8'));
console.log('nsd:', d.nsd);
console.log('keys19:', d.keys19, 'keys21:', d.keys21, 'keys22:', d.keys22.substring(0, 30));
console.log('env:', JSON.stringify(d.env).substring(0, 300));

// basearr 构造快照（len 29/30）
const b30 = d.basearr.find(x => x.len === 30);
const b29 = d.basearr.find(x => x.len === 29);
if (b30) {
  console.log('\nbasearr[0-29]:', JSON.stringify(b30.arr));
  console.log('[25-28]:', b30.arr.slice(25, 29).join(','), '=', b30.arr.slice(25, 29).map(x => x.toString(16).padStart(2, '0')).join(''));
  console.log('[24-29]:', b30.arr.slice(24, 30).join(','));
}
if (b29) {
  console.log('basearr[0-28]:', JSON.stringify(b29.arr));
}

// 1. [25-28] vs keys 各段
if (b30 && d.keys) {
  const t = b30.arr.slice(25, 29);
  const k = d.keys;
  console.log('\n=== [25-28] vs keys ===');
  const targets = {
    'k2': k[2], 'k2前8': k[2].slice(0, 8), 'k2前16': k[2].slice(0, 16),
    'k17': k[17], 'k17前16': k[17].slice(0, 16),
    'k19str': Buffer.from(d.keys19), 'k21str': Buffer.from(d.keys21),
  };
  function crc32b(buf) {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return ~c >>> 0;
  }
  for (const [name, buf] of Object.entries(targets)) {
    const crc = crc32b(Buffer.from(buf));
    const crcArr = [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
    if (crcArr.every((v, i) => v === t[i])) console.log(`★★ [25-28] = crc32(${name})!`);
    for (const hn of ['md5', 'sha1', 'sha256']) {
      const dig = crypto.createHash(hn).update(Buffer.from(buf)).digest();
      for (let s = 0; s <= dig.length - 4; s++) {
        if (dig.slice(s, s + 4).every((v, i) => v === t[i])) console.log(`★★ [25-28] = ${hn}(${name})[${s}:${s + 4}]!`);
      }
    }
  }
  // 2. [25-28] vs 环境值
  console.log('\n=== [25-28] vs 环境 ===');
  const env = d.env || {};
  const k19n = +d.keys19, k21n = +d.keys21;
  const combos = {
    'evalLen': Buffer.from([env.evalLen || 0]),
    'innerH': Buffer.from([(env.innerH || 0) >> 8 & 255, (env.innerH || 0) & 255]),
    'k19BE': Buffer.from([(k19n >>> 24) & 255, (k19n >>> 16) & 255, (k19n >>> 8) & 255, k19n & 255]),
    'k21BE': Buffer.from([(k21n >>> 24) & 255, (k21n >>> 16) & 255, (k21n >>> 8) & 255, k21n & 255]),
    'env+keys': Buffer.from([...(env.ua || '').split('').map(c => c.charCodeAt()).slice(0, 8), ...k[2].slice(0, 8)]),
  };
  for (const [name, buf] of Object.entries(combos)) {
    const crc = crc32b(buf);
    const crcArr = [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
    if (crcArr.every((v, i) => v === t[i])) console.log(`★★ [25-28] = crc32(${name})!`);
  }

  // 3. [0-23] 环境指纹段 vs 已知值
  console.log('\n=== [0-23] 环境指纹段 ===');
  console.log('basearr[0-23]:', b30.arr.slice(0, 24).join(','));
  // 常见环境值
  console.log('evalLen:', env.evalLen, 'innerH:', env.innerH, 'innerW:', env.innerW, 'maxTP:', env.maxTP, 'dpr:', env.dpr);
  console.log('UA uuid 候选:', crypto.createHash('md5').update(env.ua || '').digest('hex').substring(0, 8));
}
