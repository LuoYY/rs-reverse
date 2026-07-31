/**
 * 05_pipeline_reverse.js
 * 
 * 核心假设：query 和 cookie 共享完全相同的加密管线
 * 
 * Cookie 加密链路：
 *   basearr → huffman(numarrEncrypt) → xor(keys2, 16) → AES(keys17, flag=0) → basearrEncrypt
 * 
 * Query 解密 = 反向：
 *   session_data → AES_decrypt(keys17, flag=0) → xor(keys2, 16) → huffman_decode → plaintext
 * 
 * 关键：即使 AES 解密输出看起来像噪声，
 * 如果 key 正确，PKCS7 padding 应该有效（最后一字节 1-16）
 */

const path = require('path');
const fs = require('fs');
require('module-alias')(path.join(__dirname, '..'));

const gv = require('@src/handler/globalVarible');
const constData = require('@src/handler/parser/constData');
constData.init();

const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const { xor } = require('@src/handler/parser/common/tools');

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = i < str.length ? lookup[str[i]] : undefined;
    const c1 = i + 1 < str.length ? lookup[str[i + 1]] : undefined;
    const c2 = i + 2 < str.length ? lookup[str[i + 2]] : undefined;
    const c3 = i + 3 < str.length ? lookup[str[i + 3]] : undefined;
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));
const keys = data.keys;
const keys16 = keys['16'];
const keys17 = keys['17'];
const keys2 = keys['2'];

const q0bytes = string2numarr(data.queries[0].query.substring(1));
const sessionData = q0bytes.slice(7, 55);  // 48B
const requestData = q0bytes.slice(56, 88); // 32B

console.log('=== 管线反向解密测试 ===\n');
console.log(`keys16: [${keys16.join(',')}]`);
console.log(`keys17: [${keys17.join(',')}]`);
console.log(`keys2: [${keys2.slice(0, 20).join(',')}...] (${keys2.length}B)`);
console.log(`session_data: ${sessionData.length}B`);
console.log(`request_data: ${requestData.length}B`);

// ============ 测试 1：PKCS7 padding 有效性 ============
console.log('\n--- 测试 1：PKCS7 padding 有效性 ---');
console.log('  如果 key 正确，最后一字节应该是 1-16（有效 padding）');

// 手动 AES 解密（不 strip padding）来看原始 padding
const crypto = require('crypto');

for (const [keyName, keyArr] of [['keys16', keys16], ['keys17', keys17]]) {
  for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
    // 标准 AES-CBC flag=0（zero IV）
    try {
      const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(keyArr), Buffer.alloc(16, 0));
      d.setAutoPadding(false); // 不自动 strip padding
      const raw = Buffer.concat([d.update(Buffer.from(seg)), d.final()]);
      const lastByte = raw[raw.length - 1];
      const validPadding = lastByte >= 1 && lastByte <= 16;
      // 验证所有 padding 字节
      let paddingValid = validPadding;
      if (validPadding) {
        for (let i = raw.length - lastByte; i < raw.length; i++) {
          if (raw[i] !== lastByte) { paddingValid = false; break; }
        }
      }
      console.log(`  ${keyName} ${segName} CBC-0: lastByte=${lastByte} padding=${validPadding ? 'valid' : 'INVALID'} ${paddingValid ? '✅ ALL MATCH' : '❌ bytes mismatch'}`);
      if (paddingValid) {
        const pt = raw.slice(0, raw.length - lastByte);
        console.log(`    plaintext (${pt.length}B): [${[...pt].slice(0, 20).join(',')}]`);
      }
    } catch(e) {
      console.log(`  ${keyName} ${segName} CBC-0: error ${e.message}`);
    }
    
    // 标准 AES-CBC flag=1（embedded IV）
    if (seg.length > 16) {
      try {
        const iv = Buffer.from(seg.slice(0, 16));
        const ct = Buffer.from(seg.slice(16));
        const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(keyArr), iv);
        d.setAutoPadding(false);
        const raw = Buffer.concat([d.update(ct), d.final()]);
        const lastByte = raw[raw.length - 1];
        const validPadding = lastByte >= 1 && lastByte <= 16;
        let paddingValid = validPadding;
        if (validPadding) {
          for (let i = raw.length - lastByte; i < raw.length; i++) {
            if (raw[i] !== lastByte) { paddingValid = false; break; }
          }
        }
        console.log(`  ${keyName} ${segName} CBC-1: lastByte=${lastByte} padding=${validPadding ? 'valid' : 'INVALID'} ${paddingValid ? '✅ ALL MATCH' : '❌ bytes mismatch'}`);
        if (paddingValid) {
          const pt = raw.slice(0, raw.length - lastByte);
          console.log(`    plaintext (${pt.length}B): [${[...pt].slice(0, 20).join(',')}]`);
        }
      } catch(e) {}
    }
    
    // 标准 AES-ECB
    try {
      const d = crypto.createDecipheriv('aes-128-ecb', Buffer.from(keyArr), null);
      d.setAutoPadding(false);
      const raw = Buffer.concat([d.update(Buffer.from(seg)), d.final()]);
      const lastByte = raw[raw.length - 1];
      const validPadding = lastByte >= 1 && lastByte <= 16;
      let paddingValid = validPadding;
      if (validPadding) {
        for (let i = raw.length - lastByte; i < raw.length; i++) {
          if (raw[i] !== lastByte) { paddingValid = false; break; }
        }
      }
      console.log(`  ${keyName} ${segName} ECB: lastByte=${lastByte} padding=${validPadding ? 'valid' : 'INVALID'} ${paddingValid ? '✅ ALL MATCH' : '❌ bytes mismatch'}`);
      if (paddingValid) {
        const pt = raw.slice(0, raw.length - lastByte);
        console.log(`    plaintext (${pt.length}B): [${[...pt].slice(0, 20).join(',')}]`);
      }
    } catch(e) {}
  }
}

// ============ 测试 2：RS encryptMode2 原始输出 ============
console.log('\n--- 测试 2：RS encryptMode2 原始输出（显示所有结果）---');

for (const [keyName, keyArr] of [['keys16', keys16], ['keys17', keys17]]) {
  // 也试 numarrAddTime 变换后的 key
  let arr21;
  try { [arr21] = numarrAddTime([...keyArr]); } catch(e) { arr21 = keyArr; }
  
  for (const [kName, kArr] of [[keyName, keyArr], [`${keyName}+time`, arr21]]) {
    for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
      for (const flag of [0, 1]) {
        try {
          const pt = encryptMode2([...seg], [...kArr], flag);
          if (pt && pt.length > 0) {
            const ascii = pt.filter(b => b >= 32 && b < 127).length;
            const ratio = (ascii / pt.length * 100).toFixed(0);
            console.log(`  ${kName} ${segName} f=${flag}: ${pt.length}B ASCII=${ratio}% [${pt.slice(0, 20).join(',')}]`);
            
            // 如果输出 > 10B，尝试 XOR + huffman 解码
            if (pt.length > 10) {
              try {
                const xored = xor([...pt], keys2, 16);
                const xascii = xored.filter(b => b >= 32 && b < 127).length;
                const xratio = (xascii / xored.length * 100).toFixed(0);
                console.log(`    → XOR(keys2): ${xored.length}B ASCII=${xratio}% [${xored.slice(0, 20).join(',')}]`);
              } catch(e) {}
            }
          } else {
            console.log(`  ${kName} ${segName} f=${flag}: 空输出`);
          }
        } catch(e) {
          console.log(`  ${kName} ${segName} f=${flag}: error ${e.message.substring(0, 50)}`);
        }
      }
    }
  }
}

// ============ 测试 3：验证管线正确性（用已知 cookie 数据）============
console.log('\n--- 测试 3：管线正向验证 ---');
// 用 encryptMode1 加密已知数据，然后 encryptMode2 解密
const testPlain = [72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100, 33, 1, 2, 3, 4]; // "Hello World!" + 4 bytes
try {
  const encrypted = encryptMode1([...testPlain], [...keys17], 0);
  console.log(`  encryptMode1("Hello World!"+4B, keys17, 0): ${encrypted.length}B`);
  const decrypted = encryptMode2([...encrypted], [...keys17], 0);
  console.log(`  encryptMode2 解密: [${decrypted.join(',')}]`);
  console.log(`  匹配: ${JSON.stringify(testPlain) === JSON.stringify(decrypted) ? '✅' : '❌'}`);
  
  // 也测试带 numarrAddTime 的 key
  const [arr21_17] = numarrAddTime([...keys17]);
  const encrypted2 = encryptMode1([...testPlain], [...arr21_17], 0);
  console.log(`  encryptMode1("Hello World!"+4B, arr21, 0): ${encrypted2.length}B`);
  const decrypted2 = encryptMode2([...encrypted2], [...arr21_17], 0);
  console.log(`  encryptMode2 解密: [${decrypted2.join(',')}]`);
  console.log(`  匹配: ${JSON.stringify(testPlain) === JSON.stringify(decrypted2) ? '✅' : '❌'}`);
  
  // 交叉测试：用 arr21 加密，用 keys17 解密
  const decrypted3 = encryptMode2([...encrypted2], [...keys17], 0);
  console.log(`  交叉（arr21 加密，keys17 解密）: [${decrypted3.slice(0, 16).join(',')}]`);
  console.log(`  匹配: ${JSON.stringify(testPlain) === JSON.stringify(decrypted3) ? '✅' : '❌'}`);
} catch(e) {
  console.log(`  error: ${e.message}`);
}

// ============ 测试 4：遍历所有 keys 的 padding 检查 ============
console.log('\n--- 测试 4：所有 keys 的 AES padding 检查 ---');
console.log('  如果某个 key 的 padding 有效，说明该 key 可能是正确的');

for (const [k, v] of Object.entries(keys)) {
  if (v.length < 16) continue;
  
  // 取所有 16B 子串
  for (let off = 0; off <= v.length - 16; off++) {
    const subkey = v.slice(off, off + 16);
    
    for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
      try {
        const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from(subkey), Buffer.alloc(16, 0));
        d.setAutoPadding(false);
        const raw = Buffer.concat([d.update(Buffer.from(seg)), d.final()]);
        const lastByte = raw[raw.length - 1];
        if (lastByte >= 1 && lastByte <= 16) {
          // 检查所有 padding 字节
          let allMatch = true;
          for (let i = raw.length - lastByte; i < raw.length; i++) {
            if (raw[i] !== lastByte) { allMatch = false; break; }
          }
          if (allMatch) {
            const pt = [...raw].slice(0, raw.length - lastByte);
            const ascii = pt.filter(b => b >= 32 && b < 127).length;
            const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
            console.log(`  ★ keys[${k}][${off}:${off+16}] ${segName}: padding=${lastByte} ✅ ${pt.length}B ASCII=${ratio}% [${pt.slice(0, 16).join(',')}]`);
          }
        }
      } catch(e) {}
    }
  }
}

console.log('\n=== 完成 ===');
