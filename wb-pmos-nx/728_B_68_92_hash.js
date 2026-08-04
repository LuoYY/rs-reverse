/**
 * 728_B_68_92_hash.js
 * 测试 base[68:92] 是否与 cd 前缀哈希相关
 * 以及 base[68:92] 与明文 basearr marker 的关系
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const data = JSON.parse(fs.readFileSync('/tmp/nx_cd_base_pairs.json', 'utf8'));
const samples = data.samples;

console.log('=== base[68:92] 与 cd 哈希 ===');
for (const s of samples) {
  const seg = s.base.slice(68, 92);
  // cd 各种前缀的 MD5/SHA1 前 24 字节
  const cd = s.cd;
  const md5 = crypto.createHash('md5').update(cd).digest();
  const sha1 = crypto.createHash('sha1').update(cd).digest();
  const md5pre = crypto.createHash('md5').update(cd.substring(0, 35)).digest();
  const b86md5 = crypto.createHash('md5').update(Buffer.from(s.b86.slice(2, 142))).digest();
  console.log(`nsd=${s.nsd}:`);
  console.log(`  seg: ${seg.join(',')}`);
  console.log(`  md5(cd)前24: ${[...md5].slice(0, 24).join(',')}`);
  console.log(`  md5(cd35)前24: ${[...md5pre].slice(0, 24).join(',')}`);
}

// base[68:92] 与明文 basearr marker (cap[24+16k])
console.log('\n=== base[68:92] vs 明文basearr markers ===');
const trip = JSON.parse(fs.readFileSync('/tmp/agentB/nx_triple_dataset.json', 'utf8')).samples;
const NORMAL = trip.filter(s => s.base[26] === 233);
for (const s of NORMAL) {
  const mk = [24, 40, 56, 72, 88, 104, 120, 136].map(p => s.cap[p]);
  console.log(`nsd=${s.nsd}: markers=[${mk.join(',')}] base[68:76]=${s.base.slice(68, 76).join(',')}`);
}
