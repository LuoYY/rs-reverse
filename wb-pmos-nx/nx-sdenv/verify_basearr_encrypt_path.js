// 验证外层 VM 的 basearr 加密路径：
// 用 317B 明文 → numarrEncrypt → XOR keys2 → AES keys17 → 应该能解密回 basearr
// 且对比 sdenv cookie 的 basearrEncrypt 是否用相同路径
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

function aesEncrypt(data, key16, ivBytes) {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key16), Buffer.from(ivBytes));
  cipher.setAutoPadding(false);
  return [...cipher.update(Buffer.from(data)), ...cipher.final()];
}
function aesDecrypt(data, key16, ivBytes) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key16), Buffer.from(ivBytes));
  decipher.setAutoPadding(false);
  return [...decipher.update(Buffer.from(data)), ...decipher.final()];
}

(async () => {
  // 317B 样本
  const src = fs.readFileSync(path.join(__dirname, '../../src/handler/basearr/len243-nx.js'), 'utf8');
  const m = src.match(/const NX_BASEARR_SAMPLE = \[([\s\S]*?)\];/);
  const sample = m[1].split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
  console.log('sample len:', sample.length);

  // 用假 keys 测试加密路径长度
  const k2 = Array.from({ length: 48 }, (_, i) => i);
  const k17 = Array.from({ length: 16 }, (_, i) => i + 100);

  const enc = numarrEncrypt(sample);
  console.log('numarrEncrypt len:', enc.length);
  const xorResult = enc.map((b, i) => b ^ k2[i % 16]);
  console.log('XOR len:', xorResult.length, 'padded:', xorResult.length % 16 === 0 ? '16倍数' : '非16倍数');

  // 如果需要 padding（numarrEncrypt 输出不一定是 16 倍数）
  const padLen = 16 - (xorResult.length % 16);
  const padded = padLen === 16 ? xorResult : [...xorResult, ...Array(padLen).fill(padLen)];
  console.log('padded len:', padded.length);

  const aesOut = aesEncrypt(padded, k17, new Array(16).fill(0));
  console.log('AES(keys17) len:', aesOut.length);

  // 对比 len243-nx.js 期望的 basearrEncrypt 长度（160 或 160）
  console.log('期望 basearrEncLen: 160（sdenv cookie 实测）');

  // 逆：解密验证
  const dec = aesDecrypt(aesOut, k17, new Array(16).fill(0));
  const unpad = dec.slice(0, dec.length - dec[dec.length - 1]);
  const unxor = unpad.map((b, i) => b ^ k2[i % 16]);
  // 与 enc 对比（去掉 padding）
  const encTrim = padLen === 16 ? enc : enc;
  console.log('往返一致（前100）:', unxor.slice(0, Math.min(100, enc.length)).join(',') === enc.slice(0, 100).join(','));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
