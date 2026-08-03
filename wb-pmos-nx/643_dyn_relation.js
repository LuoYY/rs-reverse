/**
 * 643_dyn_relation.js
 * 分析 jsdom vs 浏览器 basearr：定位各段差异 + [25-28] 与 [0-23] 环境指纹的关系
 * 数据：/tmp/nx_633_data.json（同 nsd/cd 的 bB/jArr/keys）
 */
const fs = require('fs');
const crypto = require('crypto');

const d = JSON.parse(fs.readFileSync('/tmp/nx_633_data.json', 'utf8'));
const bB = d.bB, jArr = d.jArr, k = d.keys, k19n = d.k19n, k21n = d.k21n, flag = d.flag;
console.log('浏览器 basearr len:', bB.length, 'jsdom len:', jArr.length);

function hex(arr) { return arr.map(x => x.toString(16).padStart(2, '0')).join(' '); }

// 1. 完整对比（找相同段）
console.log('\n=== jsdom vs 浏览器（找相同字节）===');
const maxLen = Math.max(bB.length, jArr.length);
let sameRun = 0, bestRun = [];
for (let i = 0; i < maxLen; i++) {
  const same = bB[i] === jArr[i];
  if (same) {
    if (sameRun === 0) bestRun = [i];
    bestRun.push(i);
    sameRun++;
  } else if (sameRun > 0) {
    if (bestRun.length > 3) console.log(`相同段: [${bestRun[0]}-${bestRun[bestRun.length - 1]}] 长度 ${bestRun.length}`);
    sameRun = 0;
    bestRun = [];
  }
}
if (bestRun.length > 3) console.log(`相同段: [${bestRun[0]}-${bestRun[bestRun.length - 1]}] 长度 ${bestRun.length}`);

// 2. [25-28] 候选分析
console.log('\n=== [25-28] 对照 ===');
for (const [name, arr] of [['B', bB], ['J', jArr]]) {
  if (arr.length > 29) {
    console.log(`${name} [0-29]: ${hex(arr.slice(0, 30))}`);
    console.log(`${name} [25-28]: ${hex(arr.slice(25, 29))} BE=${arr.slice(25, 29).reduce((a, x) => a * 256 + x, 0)}`);
  }
}

// 3. keys 对照（找 [25-28] 与 keys 的加密关系）
console.log('\n=== [25-28] vs keys 加密 ===');
function crc32b(buf) {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c >>> 0;
}
// 尝试：crc32(keys 组合) 截断
for (const [name, arr] of [['B', bB], ['J', jArr]]) {
  if (arr.length < 29) continue;
  const t25 = arr.slice(25, 29);
  const t25BE = t25.reduce((a, x) => a * 256 + x, 0);
  const combos = {
    'k2': Buffer.from(k[2]),
    'k2前8': Buffer.from(k[2].slice(0, 8)),
    'k2前16': Buffer.from(k[2].slice(0, 16)),
    'k17': Buffer.from(k[17]),
    'k17前16': Buffer.from(k[17].slice(0, 16)),
    'k19str': Buffer.from(String(k19n)),
    'k21str': Buffer.from(String(k21n)),
    'k19+k21': Buffer.from(String(k19n) + String(k21n)),
    'k2+k17': Buffer.from([...k[2], ...k[17]]),
    'k19BE+k21BE': Buffer.from([(k19n >>> 24) & 255, (k19n >>> 16) & 255, (k19n >>> 8) & 255, k19n & 255, (k21n >>> 24) & 255, (k21n >>> 16) & 255, (k21n >>> 8) & 255, k21n & 255]),
  };
  for (const [cn, buf] of Object.entries(combos)) {
    const crc = crc32b(buf);
    const crcArr = [(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255];
    if (crcArr.every((v, i) => v === t25[i])) console.log(`★★ ${name} [25-28] = crc32(${cn})!`);
    const md5 = crypto.createHash('md5').update(buf).digest();
    if (md5.slice(0, 4).every((v, i) => v === t25[i])) console.log(`★★ ${name} [25-28] = md5(${cn})[:4]!`);
    if (md5.slice(-4).every((v, i) => v === t25[i])) console.log(`★★ ${name} [25-28] = md5(${cn})[-4]!`);
  }
}

// 4. jsdom 与浏览器 [0-23] 差异（环境指纹）→ [25-28] 关系
console.log('\n=== 环境指纹段差异 vs [25-28] ===');
const bFp = bB.slice(0, 24), jFp = jArr.slice(0, 24);
console.log('B [0-23]:', hex(bFp));
console.log('J [0-23]:', hex(jFp));
console.log('B [25-28]:', hex(bB.slice(25, 29)));
console.log('J [25-28]:', hex(jArr.slice(25, 29)));

// 5. 输出完整 basearr 供后续分析
console.log('\nB 完整:', hex(bB));
console.log('J 完整:', hex(jArr));
