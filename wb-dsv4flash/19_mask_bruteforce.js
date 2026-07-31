/**
 * 19_mask_bruteforce.js
 *
 * 穷举 mask 变化字节（pos10-11）的派生
 * 数据：4 个会话的 prefix + keys2/17/16 + nsd
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, 'captures');

function crc32b(buf) {
  let c = 0xffffffff;
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function md5(...p) { return [...crypto.createHash('md5').update(Buffer.concat(p.map(x => Buffer.from(x)))).digest()]; }
function sha1(...p) { return [...crypto.createHash('sha1').update(Buffer.concat(p.map(x => Buffer.from(x)))).digest()]; }

function load(f) {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
  const enc24 = (d.encLog || []).filter(c => c.resultType === 'arr[32]' && (c.args || []).join(',').includes('arr[24]'));
  if (!enc24.length || !d.keys30 || !d.keys30[17]) return null;
  const plain = enc24[0].arg0;
  return {
    file: f,
    nsd: (d.challenges ? d.challenges[d.challenges.length - 1] : d.challenge)?.nsd || null,
    prefix: plain.slice(0, 13),
    const3: plain.slice(16, 19),
    keys2: d.keys30[2].d,
    keys17: d.keys30[17].d,
    keys16: d.keys30[16].d,
  };
}

const sessions = [
  'cd_keys_query_1785488187669.json',
  'plaintext_1785488407275.json',
  'everything_1785488791311.json',
  'everything_1785489159074.json',
].map(f => load(f)).filter(Boolean);

console.log('=== 会话数据 ===');
for (const s of sessions) {
  const m = s.prefix.map((b, i) => b ^ s.keys2[i]);
  console.log(s.file.substring(0, 30), 'nsd=' + s.nsd, 'mask10-11=' + m.slice(10, 12).map(b => b.toString(16)).join(' '));
}

console.log('\n=== 尝试 mask10-11 候选公式 ===');
// 收集所有候选值并对比
const candidates = [];
function addCand(name, val) { candidates.push({ name, val }); }

for (const s of sessions) {
  const k17 = s.keys17, k2 = s.keys2, k16 = s.keys16;
  // 各种哈希
  addCand('crc32(k17)', [crc32b(Buffer.from(k17)) >>> 24 & 255, crc32b(Buffer.from(k17)) >>> 16 & 255]);
  addCand('crc32(k17)3-4', [crc32b(Buffer.from(k17)) >>> 8 & 255, crc32b(Buffer.from(k17)) & 255]);
  addCand('crc32(k2)', [crc32b(Buffer.from(k2)) >>> 24 & 255, crc32b(Buffer.from(k2)) >>> 16 & 255]);
  addCand('crc32(k2)3-4', [crc32b(Buffer.from(k2)) >>> 8 & 255, crc32b(Buffer.from(k2)) & 255]);
  addCand('md5(k17)[10:12]', md5(k17).slice(10, 12));
  addCand('md5(k2)[10:12]', md5(k2).slice(10, 12));
  addCand('sha1(k17)[10:12]', sha1(k17).slice(10, 12));
  addCand('sha1(k2)[10:12]', sha1(k2).slice(10, 12));
  // keys 直接切片
  addCand('k17[9:11]', [k17[9], k17[10]]);
  addCand('k17[8:10]', [k17[8], k17[9]]);
  addCand('k17[10:12]', [k17[10], k17[11]]);
  addCand('k2[10:12]', [k2[10], k2[11]]);
  addCand('k2[9:11]', [k2[9], k2[10]]);
  addCand('k16[10:12]', [k16[10], k16[11]]);
  // XOR 组合
  addCand('k17^k2[10:12]', [k17[10] ^ k2[10], k17[11] ^ k2[11]]);
  addCand('k17^k16[10:12]', [k17[10] ^ k16[10], k17[11] ^ k16[11]]);
  addCand('k2^k16[10:12]', [k2[10] ^ k16[10], k2[11] ^ k16[11]]);
  addCand('k17[9]^k17[10]', [k17[9] ^ k17[10], k17[10] ^ k17[11]]);
  addCand('k2[8:10]^k2[10:12]', [k2[8] ^ k2[10], k2[9] ^ k2[11]]);
  // nsd 相关
  if (s.nsd) {
    addCand('nsd&0xffff', [s.nsd >>> 8 & 255, s.nsd & 255]);
    addCand('nsd低16位', [s.nsd & 255, (s.nsd >>> 8) & 255]);
    addCand('crc32(nsd)[2:4]', [crc32b(Buffer.from(String(s.nsd))) >>> 8 & 255, crc32b(Buffer.from(String(s.nsd))) & 255]);
  }
}

// 找到跨会话一致的公式
for (const cand of candidates) {
  const ok = sessions.every((s, si) => {
    const m = s.prefix.map((b, i) => b ^ s.keys2[i]);
    return cand.val[0] === m[10] && cand.val[1] === m[11];
  });
  if (ok) console.log('  ★★★ 公式成立:', cand.name, '=', cand.val.map(b => b.toString(16)).join(' '));
}

process.exit(0);
