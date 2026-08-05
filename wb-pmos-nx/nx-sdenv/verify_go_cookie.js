// 验证 Go 生成的 cookie 能否正确解密（用 Go 的 keys + 解出的 basearr）
// 目标：确认 Go 的 generateCookie 逻辑对 nx 有效（结构正确）
const fs = require('fs');
const crypto = require('crypto');

// Go 输出的 keys（从上次运行）
const goKeys2 = [14,194,25,253,169,94,239,226,212,151,80,3,7,166,24,317,180,159,236,223,69,18,37,153,169,77,248,255,145,72,44,3,194,173,106,203,53,59,48,249,47,91,184,179,169,178,65,162];
const goKeys16 = [215,90,92,114,190,161,210,59,55,192,204,2,209,95,17,173];
const goKeys17 = [189,225,232,167,21,116,0,125,1,160,3,0,4,5,7,4];

// 手动生成一个 cookie（模拟 generateCookie）
function numarrAddTime(keys, runTime, random) {
  const ele = Math.floor(random * 4294967295) % 7 + 3;
  const newKeys = [...keys];
  newKeys.push(...[(runTime >> 24) & 255, (runTime >> 16) & 255, (runTime >> 8) & 255, runTime & 255]);
  for (let i = keys.length - 1; i >= 0; i--) newKeys[i] ^= newKeys[i + ele] || 0;
  newKeys.push(ele);
  return newKeys;
}
// AES-CBC 加密（flag=1: IV 前置）
function aesEncrypt(data, key16, ivBytes) {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key16), Buffer.from(ivBytes));
  cipher.setAutoPadding(false);
  return [...cipher.update(Buffer.from(data)), ...cipher.final()];
}
function xorBytes(a, b) { return a.map((v, i) => v ^ b[i % b.length]); }
// 简化：直接构造一个最小 cookie 结构验证 keys 一致性
console.log('=== Go keys 验证 ===');
console.log('keys16 后8:', goKeys16.slice(8).join(','));
console.log('keys17 后8 (=offset):', goKeys17.slice(8).join(','));
console.log('keys2[15]:', goKeys2[15], '(317 & 255 =', goKeys2[15] & 255, ')');
// numarrAddTime 测试
const t = numarrAddTime(goKeys17, 1800000000, 0.5);
console.log('numarrAddTime(keys17) len:', t.length, '前8:', t.slice(0, 8).join(','));
process.exit(0);
