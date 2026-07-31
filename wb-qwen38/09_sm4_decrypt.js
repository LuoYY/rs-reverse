/**
 * 09_sm4_decrypt.js
 * 
 * 核心假设：query 使用 SM4（国密）而非 AES 加密！
 * 
 * 证据：
 * 1. RS 闭包含 SM2CipherMode 常量（C1C2C3=0, C1C3C2=1）
 * 2. 目标是国家电网（sgcc），政府网站常用国密
 * 3. 所有 AES 解密尝试失败（PKCS7 padding 无效）
 * 4. SM4 与 AES 同为 128-bit 分组密码，但 S-Box 和轮函数完全不同
 * 
 * SM4 参数（来自 crypto_fixed.js）：
 * - S-Box: 16x16 = 256 元素（与 AES S-Box 完全不同）
 * - fk: [0xA3B1BAC6, 0x56AA3350, 0x677D9197, 0xB27022DC]
 * - ck: 32 个轮常量
 * - 32 轮 Feistel 结构
 */

const fs = require('fs');
const path = require('path');

// ============ SM4 实现（自包含） ============

const SM4_SBOX = [
  [214,144,233,254,204,225,61,183,22,182,20,194,40,251,44,5],
  [43,103,154,118,42,190,4,195,170,68,19,38,73,134,6,153],
  [156,66,80,244,145,239,152,122,51,84,11,67,237,207,172,98],
  [228,179,28,169,201,8,232,149,128,223,148,250,117,143,63,166],
  [71,7,167,252,243,115,23,186,131,89,60,25,230,133,79,168],
  [104,107,129,178,113,100,218,139,248,235,15,75,112,86,157,53],
  [30,36,14,94,99,88,209,162,37,34,124,59,1,33,120,135],
  [212,0,70,87,159,211,39,82,76,54,2,231,160,196,200,158],
  [234,191,138,210,64,199,56,181,163,247,242,206,249,97,21,161],
  [224,174,93,164,155,52,26,85,173,147,50,48,245,140,177,227],
  [29,246,226,46,130,102,202,96,192,41,35,171,13,83,78,111],
  [213,219,55,69,222,253,142,47,3,255,106,114,109,108,91,81],
  [141,27,175,146,187,221,188,127,17,217,92,65,31,16,90,216],
  [10,193,49,136,165,205,123,189,45,116,208,18,184,229,180,176],
  [137,105,151,74,12,150,119,126,101,185,241,9,197,110,198,132],
  [24,240,125,236,58,220,77,32,121,238,95,62,215,203,57,72]
];

const SM4_CK = [
  462357, 472066609, 943670861, 1415275113, 1886879365, 2358483617, 2830087869, 3301692121,
  3773296373, 4228057617, 404694573, 876298825, 1347903077, 1819507329, 2291111581, 2762715833,
  3234320085, 3705924337, 4177462797, 337322537, 808926789, 1280531041, 1752135293, 2223739545,
  2695343797, 3166948049, 3638552301, 4110090761, 269950501, 741554753, 1213159005, 1684763257
];

const SM4_FK = [2746333894, 1453994832, 1736282519, 2993693404];

function sm4_sbox(word) {
  return (
    SM4_SBOX[(word >>> 28) & 0xf][(word >>> 24) & 0xf] << 24 |
    SM4_SBOX[(word >>> 20) & 0xf][(word >>> 16) & 0xf] << 16 |
    SM4_SBOX[(word >>> 12) & 0xf][(word >>> 8) & 0xf] << 8 |
    SM4_SBOX[(word >>> 4) & 0xf][word & 0xf]
  );
}

function rotl(x, n) {
  n %= 32;
  return (x << n) | (x >>> (32 - n));
}

// 加密轮函数 T
function sm4_T(x) {
  const b = sm4_sbox(x);
  return b ^ rotl(b, 2) ^ rotl(b, 10) ^ rotl(b, 18) ^ rotl(b, 24);
}

// 密钥扩展轮函数 T'
function sm4_T_prime(x) {
  const b = sm4_sbox(x);
  return b ^ rotl(b, 13) ^ rotl(b, 23);
}

// 密钥扩展：4 个 uint32 key → 32 个轮密钥
function sm4_key_expansion(key_words) {
  const K = new Array(36);
  K[0] = key_words[0] ^ SM4_FK[0];
  K[1] = key_words[1] ^ SM4_FK[1];
  K[2] = key_words[2] ^ SM4_FK[2];
  K[3] = key_words[3] ^ SM4_FK[3];
  
  const rk = new Array(32);
  for (let i = 0; i < 32; i++) {
    K[i + 4] = K[i] ^ sm4_T_prime(K[i+1] ^ K[i+2] ^ K[i+3] ^ SM4_CK[i]);
    rk[i] = K[i + 4];
  }
  return rk;
}

// SM4 加密一个 16 字节块（4 个 uint32）
function sm4_encrypt_block(block, rk) {
  const X = new Array(36);
  X[0] = block[0]; X[1] = block[1]; X[2] = block[2]; X[3] = block[3];
  
  for (let i = 0; i < 32; i++) {
    X[i + 4] = X[i] ^ sm4_T(X[i+1] ^ X[i+2] ^ X[i+3] ^ rk[i]);
  }
  
  // 反序输出
  return [X[35], X[34], X[33], X[32]];
}

// SM4 解密一个 16 字节块（轮密钥逆序）
function sm4_decrypt_block(block, rk) {
  const rk_rev = rk.slice().reverse();
  return sm4_encrypt_block(block, rk_rev);
}

// 字节数组 → uint32 数组（大端）
function bytes_to_words(bytes) {
  const words = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(((bytes[i] << 24) | (bytes[i+1] << 16) | (bytes[i+2] << 8) | bytes[i+3]) >>> 0);
  }
  return words;
}

// uint32 数组 → 字节数组（大端）
function words_to_bytes(words) {
  const bytes = [];
  for (const w of words) {
    bytes.push((w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
  }
  return bytes;
}

// SM4-ECB 解密
function sm4_ecb_decrypt(data_bytes, key_bytes) {
  const key_words = bytes_to_words(key_bytes);
  const rk = sm4_key_expansion(key_words);
  const data_words = bytes_to_words(data_bytes);
  
  let result = [];
  for (let i = 0; i < data_words.length; i += 4) {
    const block = data_words.slice(i, i + 4);
    const dec = sm4_decrypt_block(block, rk);
    result.push(...dec);
  }
  return words_to_bytes(result);
}

// SM4-CBC 解密
function sm4_cbc_decrypt(data_bytes, key_bytes, iv_bytes) {
  const key_words = bytes_to_words(key_bytes);
  const rk = sm4_key_expansion(key_words);
  const data_words = bytes_to_words(data_bytes);
  const iv_words = iv_bytes ? bytes_to_words(iv_bytes) : [0, 0, 0, 0];
  
  let result = [];
  let prev = iv_words;
  
  for (let i = 0; i < data_words.length; i += 4) {
    const block = data_words.slice(i, i + 4);
    const dec = sm4_decrypt_block(block, rk);
    const pt = dec.map((w, j) => (w ^ prev[j]) >>> 0);
    result.push(...pt);
    prev = block;
  }
  return words_to_bytes(result);
}

// ============ 验证 SM4 实现 ============
console.log('=== SM4 实现验证 ===\n');

// 标准测试向量：key = 0123456789ABCDEFFEDCBA9876543210, plaintext = same
const testKey = [0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF,0xFE,0xDC,0xBA,0x98,0x76,0x54,0x32,0x10];
const testPlain = [0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF,0xFE,0xDC,0xBA,0x98,0x76,0x54,0x32,0x10];
const expectedCipher = [0x68,0x1E,0xDF,0x34,0xD2,0x06,0x96,0x5E,0x86,0xB3,0xE9,0x4F,0x53,0x6E,0x42,0x46];

const encResult = words_to_bytes(sm4_encrypt_block(bytes_to_words(testPlain), sm4_key_expansion(bytes_to_words(testKey))));
const encMatch = JSON.stringify(encResult) === JSON.stringify(expectedCipher);
console.log(`  加密测试: ${encMatch ? '✅ 通过' : '❌ 失败'}`);
if (!encMatch) {
  console.log(`    期望: [${expectedCipher.join(',')}]`);
  console.log(`    实际: [${encResult.join(',')}]`);
}

const decResult = sm4_ecb_decrypt(expectedCipher, testKey);
const decMatch = JSON.stringify(decResult) === JSON.stringify(testPlain);
console.log(`  解密测试: ${decMatch ? '✅ 通过' : '❌ 失败'}`);

// ============ 加载 query 数据 ============
const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup[str[i]], c1 = lookup[str[i+1]], c2 = lookup[str[i+2]], c3 = lookup[str[i+3]];
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));
const keys = data.keys;
const q0 = string2numarr(data.queries[0].query.substring(1));
const sessionData = q0.slice(7, 55);  // 48B
const requestData = q0.slice(56, 88); // 32B

console.log(`\n=== SM4 解密 query 数据 ===\n`);
console.log(`session_data: ${sessionData.length}B = ${sessionData.length / 16} SM4 blocks`);
console.log(`request_data: ${requestData.length}B = ${requestData.length / 16} SM4 blocks`);

// 收集 16 字节 key 候选
const keyCandidates = [];
for (const [k, v] of Object.entries(keys)) {
  if (v.length === 16) keyCandidates.push({ name: `keys[${k}]`, key: v });
  if (v.length > 16) {
    for (let off = 0; off <= v.length - 16; off += 16) {
      keyCandidates.push({ name: `keys[${k}][${off}:${off+16}]`, key: v.slice(off, off + 16) });
    }
  }
}

// 也加 MD5 派生
const crypto = require('crypto');
const pCookieBytes = data.cookie ? string2numarr(data.cookie.substring(1)) : [];
keyCandidates.push({ name: 'MD5(keys16+keys17)', key: [...crypto.createHash('md5').update(Buffer.from([...keys['16'], ...keys['17']])).digest()] });
keyCandidates.push({ name: 'MD5(P_cookie)', key: [...crypto.createHash('md5').update(Buffer.from(pCookieBytes)).digest()] });
keyCandidates.push({ name: 'SM3(keys16)[0:16]', key: [] }); // placeholder

console.log(`\n${keyCandidates.length} 个 key 候选\n`);

// SM4-ECB 解密
console.log('--- SM4-ECB 解密 ---');
for (const kc of keyCandidates) {
  if (kc.key.length !== 16) continue;
  
  for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
    try {
      const pt = sm4_ecb_decrypt(seg, kc.key);
      const ascii = pt.filter(b => b >= 32 && b < 127).length;
      const ratio = (ascii / pt.length * 100).toFixed(0);
      
      // 检查 PKCS7 padding
      const lastByte = pt[pt.length - 1];
      const validPad = lastByte >= 1 && lastByte <= 16;
      let padOk = validPad;
      if (validPad) {
        for (let i = pt.length - lastByte; i < pt.length; i++) {
          if (pt[i] !== lastByte) { padOk = false; break; }
        }
      }
      
      if (ratio > 55 || padOk) {
        const hex = pt.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const asciiStr = pt.filter(b => b >= 32 && b < 127).map(b => String.fromCharCode(b)).join('');
        console.log(`  ★ ${kc.name} ${segName} ECB: ${pt.length}B ASCII=${ratio}% pad=${padOk ? '✅' + lastByte : '❌'} [${hex}] ${asciiStr.length > 3 ? '"' + asciiStr.substring(0, 30) + '"' : ''}`);
      }
    } catch(e) {}
  }
}

// SM4-CBC 解密（zero IV）
console.log('\n--- SM4-CBC 解密 (zero IV) ---');
for (const kc of keyCandidates) {
  if (kc.key.length !== 16) continue;
  
  for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
    try {
      const pt = sm4_cbc_decrypt(seg, kc.key, null);
      const ascii = pt.filter(b => b >= 32 && b < 127).length;
      const ratio = (ascii / pt.length * 100).toFixed(0);
      
      const lastByte = pt[pt.length - 1];
      const validPad = lastByte >= 1 && lastByte <= 16;
      let padOk = validPad;
      if (validPad) {
        for (let i = pt.length - lastByte; i < pt.length; i++) {
          if (pt[i] !== lastByte) { padOk = false; break; }
        }
      }
      
      if (ratio > 55 || padOk) {
        const hex = pt.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`  ★ ${kc.name} ${segName} CBC: ${pt.length}B ASCII=${ratio}% pad=${padOk ? '✅' + lastByte : '❌'} [${hex}]`);
      }
    } catch(e) {}
  }
}

// SM4-CBC 解密（embedded IV = 前 16B）
console.log('\n--- SM4-CBC 解密 (embedded IV) ---');
for (const kc of keyCandidates) {
  if (kc.key.length !== 16) continue;
  
  for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
    if (seg.length <= 16) continue;
    try {
      const iv = seg.slice(0, 16);
      const ct = seg.slice(16);
      const pt = sm4_cbc_decrypt(ct, kc.key, iv);
      const ascii = pt.filter(b => b >= 32 && b < 127).length;
      const ratio = (ascii / pt.length * 100).toFixed(0);
      
      const lastByte = pt[pt.length - 1];
      const validPad = lastByte >= 1 && lastByte <= 16;
      let padOk = validPad;
      if (validPad) {
        for (let i = pt.length - lastByte; i < pt.length; i++) {
          if (pt[i] !== lastByte) { padOk = false; break; }
        }
      }
      
      if (ratio > 55 || padOk) {
        const hex = pt.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`  ★ ${kc.name} ${segName} CBC-emb: ${pt.length}B ASCII=${ratio}% pad=${padOk ? '✅' + lastByte : '❌'} [${hex}]`);
      }
    } catch(e) {}
  }
}

// 额外：用 CDP 捕获的 key 测试
console.log('\n--- CDP 捕获 key 测试 ---');
const cdpKeys = [
  { name: 'cdp_key1', key: [0xa6,0x92,0xea,0xc1,0x2b,0x5d,0xfc,0x7d,0xde,0x71,0xea,0xab,0x0e,0x6d,0x29,0xb6] },
  { name: 'cdp_key3', key: [0xaf,0x69,0x7b,0xe2,0x68,0x15,0x86,0x64,0x01,0x9c,0x03,0x00,0x05,0x02,0x07,0x04] },
];

for (const kc of cdpKeys) {
  for (const [segName, seg] of [['session', sessionData], ['request', requestData]]) {
    for (const [mode, fn] of [['ECB', () => sm4_ecb_decrypt(seg, kc.key)], ['CBC', () => sm4_cbc_decrypt(seg, kc.key, null)]]) {
      try {
        const pt = fn();
        const ascii = pt.filter(b => b >= 32 && b < 127).length;
        const ratio = (ascii / pt.length * 100).toFixed(0);
        const lastByte = pt[pt.length - 1];
        let padOk = lastByte >= 1 && lastByte <= 16;
        if (padOk) { for (let i = pt.length - lastByte; i < pt.length; i++) { if (pt[i] !== lastByte) { padOk = false; break; } } }
        
        if (ratio > 50 || padOk) {
          console.log(`  ★ ${kc.name} ${segName} ${mode}: ${pt.length}B ASCII=${ratio}% pad=${padOk ? '✅' : '❌'} [${pt.slice(0,16).join(',')}]`);
        }
      } catch(e) {}
    }
  }
}

// 也测试新会话的 query（来自 CDP 捕获）
console.log('\n--- 新会话 query 测试 ---');
const captureDir = path.join(__dirname, 'captures');
const captureFiles = fs.readdirSync(captureDir).filter(f => f.startsWith('bytecode_'));
if (captureFiles.length > 0) {
  const cap = JSON.parse(fs.readFileSync(path.join(captureDir, captureFiles[0]), 'utf8'));
  if (cap.queries && cap.queries.length > 0) {
    const q = string2numarr(cap.queries[0].query.substring(1));
    if (q.length === 88) {
      const sess = q.slice(7, 55);
      const req = q.slice(56, 88);
      console.log(`  新会话 session_data: [${sess.slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join(' ')}...]`);
      console.log(`  新会话 request_data: [${req.slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join(' ')}...]`);
      
      // 用旧会话 keys 测试（应该失败，不同会话）
      // 主要验证 SM4 实现不会崩溃
      const pt = sm4_ecb_decrypt(sess, keys['16']);
      console.log(`  SM4-ECB(keys16) session: [${pt.slice(0,8).join(',')}] (期望噪声)`);
    }
  }
}

console.log('\n=== 完成 ===');
