/**
 * 01_verify_structure.js
 * 
 * 目标：验证 query 的 88 字节结构假设
 * 1. 解码 query 字符串 → 88 字节
 * 2. 验证 CRC32 假设：bytes[0..3] = CRC32(bytes[4..87])
 * 3. 验证 numarrJoin 结构：[nonce 4B][1][0][48][session 48B][32][request 32B]
 * 4. 用同会话 keys 尝试 encryptMode2 解密
 * 
 * 关键假设来源：外部文章指出 arr_4 = CRC32(arr_549)，即前 4 字节是后续数据的 CRC32 校验
 */

const fs = require('fs');
const path = require('path');

// ============ 自包含实现（不依赖项目管线） ============

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

// numarr2string 的逆操作：字符串 → 字节数组
function string2numarr(str, keys) {
  keys = keys || basestr.split('');
  // 建立反向查找表
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = i < str.length ? lookup[str[i]] : undefined;
    const c1 = i + 1 < str.length ? lookup[str[i + 1]] : undefined;
    const c2 = i + 2 < str.length ? lookup[str[i + 2]] : undefined;
    const c3 = i + 3 < str.length ? lookup[str[i + 3]] : undefined;
    
    if (c0 !== undefined && c1 !== undefined) {
      ans.push((c0 << 2) | (c1 >> 4));
    }
    if (c1 !== undefined && c2 !== undefined) {
      ans.push(((c1 & 15) << 4) | (c2 >> 2));
    }
    if (c2 !== undefined && c3 !== undefined) {
      ans.push(((c2 & 3) << 6) | c3);
    }
  }
  return ans;
}

// CRC32 实现（与管线 uuid.js 一致）
function makeCrcTable() {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(numarr) {
  let val = 0 ^ -1;
  for (let i = 0; i < numarr.length; i++) {
    val = (val >>> 8) ^ crcTable[(val ^ numarr[i]) & 255];
  }
  return (val ^ -1) >>> 0;
}

// 大端 uint32 → 4 字节
function uint32ToBytes(val) {
  return [(val >>> 24) & 255, (val >>> 16) & 255, (val >>> 8) & 255, val & 255];
}

// 4 字节 → 大端 uint32
function bytesToUint32(arr) {
  return ((arr[0] << 24) | (arr[1] << 16) | (arr[2] << 8) | arr[3]) >>> 0;
}

// ============ AES 实现（自包含，与管线 modeEncrypt.js 一致） ============

// AES S-Box
const SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
];

// 逆 S-Box
const INV_SBOX = new Array(256);
for (let i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;

// GF(2^8) 乘法
function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

// AES 密钥扩展
function aesKeyExpansion(key) {
  const Nk = key.length / 4;
  const Nr = Nk + 6;
  const w = [];
  
  for (let i = 0; i < Nk; i++) {
    w[i] = [key[4*i], key[4*i+1], key[4*i+2], key[4*i+3]];
  }
  
  const rcon = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];
  
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let temp = [...w[i-1]];
    if (i % Nk === 0) {
      // RotWord
      temp = [temp[1], temp[2], temp[3], temp[0]];
      // SubWord
      temp = temp.map(b => SBOX[b]);
      // XOR Rcon
      temp[0] ^= rcon[i/Nk - 1];
    } else if (Nk > 6 && i % Nk === 4) {
      temp = temp.map(b => SBOX[b]);
    }
    w[i] = w[i-Nk].map((b, j) => b ^ temp[j]);
  }
  
  return { w, Nr, Nk };
}

// AES 解密单块（16 字节）
function aesDecryptBlock(block, roundKeys, Nr) {
  // AddRoundKey (last round)
  let state = block.map((b, i) => b ^ roundKeys[4*Nr + (i%4)][Math.floor(i/4)]);
  
  // Rearrange state to column-major
  let s = new Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      s[r + 4*c] = state[r*4 + c];
  
  for (let round = Nr - 1; round >= 0; round--) {
    // InvShiftRows
    let ns = new Array(16);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        ns[r + 4*c] = s[r + 4*((c + r) % 4)];
    s = ns;
    
    // InvSubBytes
    s = s.map(b => INV_SBOX[b]);
    
    // AddRoundKey
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        s[r + 4*c] ^= roundKeys[4*round + c][r];
    
    // InvMixColumns (skip for round 0)
    if (round > 0) {
      for (let c = 0; c < 4; c++) {
        const a = [s[4*c], s[4*c+1], s[4*c+2], s[4*c+3]];
        s[4*c]   = gmul(a[0],14) ^ gmul(a[1],11) ^ gmul(a[2],13) ^ gmul(a[3],9);
        s[4*c+1] = gmul(a[0],9)  ^ gmul(a[1],14) ^ gmul(a[2],11) ^ gmul(a[3],13);
        s[4*c+2] = gmul(a[0],13) ^ gmul(a[1],9)  ^ gmul(a[2],14) ^ gmul(a[3],11);
        s[4*c+3] = gmul(a[0],11) ^ gmul(a[1],13) ^ gmul(a[2],9)  ^ gmul(a[3],14);
      }
    }
  }
  
  // Convert back to row-major
  let out = new Array(16);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      out[r*4 + c] = s[r + 4*c];
  
  return out;
}

// 标准 AES-CBC 解密
function aesCbcDecrypt(data, key, iv) {
  const { w, Nr } = aesKeyExpansion(key);
  const blocks = [];
  for (let i = 0; i < data.length; i += 16) {
    blocks.push(data.slice(i, i + 16));
  }
  
  let prev = iv || new Array(16).fill(0);
  let plaintext = [];
  
  for (const block of blocks) {
    const dec = aesDecryptBlock(block, w, Nr);
    const pt = dec.map((b, i) => b ^ prev[i]);
    plaintext.push(...pt);
    prev = block;
  }
  
  // Strip PKCS7 padding
  const padLen = plaintext[plaintext.length - 1];
  if (padLen > 0 && padLen <= 16) {
    plaintext = plaintext.slice(0, plaintext.length - padLen);
  }
  
  return plaintext;
}

// ============ 主逻辑 ============

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));

console.log('=== Query 结构验证 ===\n');

// 解码所有 query
const decoded = data.queries.map((q, i) => {
  const raw = q.query;
  const body = raw.substring(1); // 去掉 '0' 前缀
  const bytes = string2numarr(body, basestr.split(''));
  return { idx: i, method: q.method, path: q.path, raw, bytes, len: bytes.length };
});

// 1. 验证长度
console.log('--- 1. 长度验证 ---');
decoded.forEach(d => {
  console.log(`  Query[${d.idx}] ${d.method} ${d.path}: ${d.len} bytes (期望 88)`);
});

// 2. 验证 CRC32 假设
console.log('\n--- 2. CRC32 假设验证 ---');
console.log('  假设: bytes[0..3] = CRC32(bytes[4..87]) (大端)');
decoded.forEach(d => {
  if (d.len !== 88) { console.log(`  Query[${d.idx}]: 长度不是 88，跳过`); return; }
  const storedCrc = bytesToUint32(d.bytes.slice(0, 4));
  const computedCrc = crc32(d.bytes.slice(4));
  const match = storedCrc === computedCrc;
  console.log(`  Query[${d.idx}]: stored=0x${storedCrc.toString(16).padStart(8,'0')} computed=0x${computedCrc.toString(16).padStart(8,'0')} ${match ? '✅ MATCH' : '❌ MISMATCH'}`);
});

// 也测试小端
console.log('\n  假设: bytes[0..3] = CRC32(bytes[4..87]) (小端)');
decoded.forEach(d => {
  if (d.len !== 88) return;
  const storedCrcLE = ((d.bytes[3] << 24) | (d.bytes[2] << 16) | (d.bytes[1] << 8) | d.bytes[0]) >>> 0;
  const computedCrc = crc32(d.bytes.slice(4));
  const match = storedCrcLE === computedCrc;
  console.log(`  Query[${d.idx}]: stored=0x${storedCrcLE.toString(16).padStart(8,'0')} computed=0x${computedCrc.toString(16).padStart(8,'0')} ${match ? '✅ MATCH' : '❌ MISMATCH'}`);
});

// 也测试 CRC32 包含全部 88 字节
console.log('\n  假设: CRC32(bytes[0..87]) == 0 (自校验)');
decoded.forEach(d => {
  if (d.len !== 88) return;
  const fullCrc = crc32(d.bytes);
  console.log(`  Query[${d.idx}]: CRC32(full)=0x${fullCrc.toString(16).padStart(8,'0')} ${fullCrc === 0 ? '✅ ZERO' : ''}`);
});

// 3. 验证 numarrJoin 结构
console.log('\n--- 3. numarrJoin 结构验证 ---');
decoded.forEach(d => {
  if (d.len !== 88) return;
  const b = d.bytes;
  console.log(`  Query[${d.idx}]:`);
  console.log(`    nonce: [${b.slice(0,4).join(',')}]`);
  console.log(`    byte[4]=${b[4]} (期望 1=版本)`);
  console.log(`    byte[5]=${b[5]} (期望 0=类型)`);
  console.log(`    byte[6]=${b[6]} (期望 48=session长度)`);
  console.log(`    session_data: [${b.slice(7,55).join(',')}] (${b.slice(7,55).length}B)`);
  console.log(`    byte[55]=${b[55]} (期望 32=request长度)`);
  console.log(`    request_data: [${b.slice(56,88).join(',')}] (${b.slice(56,88).length}B)`);
});

// 4. 差分验证
console.log('\n--- 4. 差分验证 ---');
if (decoded.length >= 2 && decoded[0].len === 88) {
  const ref = decoded[0].bytes;
  // 找共同前缀（跳过 nonce）
  let commonStart = 4;
  while (commonStart < 88 && decoded.every(d => d.bytes[commonStart] === ref[commonStart])) {
    commonStart++;
  }
  console.log(`  跳过 nonce 后共同前缀: bytes[4..${commonStart-1}] (${commonStart - 4} bytes)`);
  
  // 找共同后缀
  let commonEnd = 87;
  while (commonEnd >= 4 && decoded.every(d => d.bytes[commonEnd] === ref[commonEnd])) {
    commonEnd--;
  }
  console.log(`  共同后缀: bytes[${commonEnd+1}..87] (${87 - commonEnd} bytes)`);
  
  // 变化区域
  console.log(`  变化区域: bytes[${commonStart}..${commonEnd}] (${commonEnd - commonStart + 1} bytes)`);
  
  // 逐字节差分
  const diffMap = new Array(88).fill(true);
  for (let i = 0; i < 88; i++) {
    diffMap[i] = decoded.every(d => d.bytes[i] === ref[i]);
  }
  const fixedRanges = [];
  let start = -1;
  for (let i = 0; i < 88; i++) {
    if (diffMap[i] && start === -1) start = i;
    if ((!diffMap[i] || i === 87) && start !== -1) {
      const end = diffMap[i] ? i : i - 1;
      fixedRanges.push([start, end]);
      start = -1;
    }
  }
  console.log(`  固定段: ${fixedRanges.map(r => `[${r[0]}..${r[1]}](${r[1]-r[0]+1}B)`).join(', ')}`);
}

// 5. 用同会话 keys 尝试 AES 解密
console.log('\n--- 5. 同会话 AES 解密尝试 ---');
const keys = data.keys;
const keyCandidates = [];

// 收集所有 16 字节和 32 字节 key
for (const [k, v] of Object.entries(keys)) {
  if (v.length === 16) keyCandidates.push({ name: `keys[${k}]`, key: v, size: 16 });
  if (v.length === 32) keyCandidates.push({ name: `keys[${k}]`, key: v, size: 32 });
  // 也取前 16 字节
  if (v.length > 16) keyCandidates.push({ name: `keys[${k}][0:16]`, key: v.slice(0, 16), size: 16 });
  if (v.length > 32) keyCandidates.push({ name: `keys[${k}][0:32]`, key: v.slice(0, 32), size: 32 });
}

console.log(`  Key 候选: ${keyCandidates.length} 个`);

if (decoded[0] && decoded[0].len === 88) {
  const sessionData = decoded[0].bytes.slice(7, 55);  // 48B
  const requestData = decoded[0].bytes.slice(56, 88); // 32B
  const nonce = decoded[0].bytes.slice(0, 4);
  
  // 各种 IV 方案
  const ivZero = new Array(16).fill(0);
  const ivNonce = [...nonce, ...nonce, ...nonce, ...nonce]; // nonce 重复填充到 16B
  const ivSessionFirst16 = sessionData.slice(0, 16);
  
  for (const kc of keyCandidates) {
    if (kc.size !== 16) continue; // 先只测 AES-128
    
    for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
      for (const [ivName, iv] of [['zero', ivZero], ['nonce', ivNonce], ['first16', target.slice(0, 16)]]) {
        try {
          // 标准 AES-CBC（IV 在数据前面）
          const pt = aesCbcDecrypt(target, kc.key, iv);
          const ascii = pt.filter(b => b >= 32 && b < 127).length;
          const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
          if (ratio > 60) {
            console.log(`  ★ ${kc.name} ${targetName} iv=${ivName}: ${pt.length}B, ASCII ${ratio}% → [${pt.slice(0,20).join(',')}]`);
          }
        } catch(e) {}
        
        try {
          // flag=1 模式：前 16B 是 IV
          if (target.length > 16) {
            const embeddedIv = target.slice(0, 16);
            const ciphertext = target.slice(16);
            const pt = aesCbcDecrypt(ciphertext, kc.key, embeddedIv);
            const ascii = pt.filter(b => b >= 32 && b < 127).length;
            const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
            if (ratio > 60) {
              console.log(`  ★ ${kc.name} ${targetName} embeddedIV: ${pt.length}B, ASCII ${ratio}% → [${pt.slice(0,20).join(',')}]`);
            }
          }
        } catch(e) {}
      }
    }
  }
  
  // 也测试整体 88 字节（跳过 nonce）
  console.log('\n  整体解密（bytes[4..87] = 84B，不是 16 的倍数，跳过）');
  
  // 测试 bytes[4..87] 中 16 对齐的部分
  // session+header = bytes[4..55] = 52B (不是 16 倍数)
  // request+header = bytes[55..87] = 33B (不是 16 倍数)
  // 纯 session = bytes[7..55] = 48B ✓
  // 纯 request = bytes[56..88] = 32B ✓
  // session+request = bytes[7..88] = 81B (不是 16 倍数)
  
  // 尝试 ECB 模式（无 IV）
  console.log('\n  ECB 模式尝试:');
  for (const kc of keyCandidates) {
    if (kc.size !== 16) continue;
    for (const [targetName, target] of [['session', sessionData], ['request', requestData]]) {
      try {
        const { w, Nr } = aesKeyExpansion(kc.key);
        let pt = [];
        for (let i = 0; i < target.length; i += 16) {
          const block = target.slice(i, i + 16);
          const dec = aesDecryptBlock(block, w, Nr);
          pt.push(...dec);
        }
        const ascii = pt.filter(b => b >= 32 && b < 127).length;
        const ratio = pt.length > 0 ? (ascii / pt.length * 100).toFixed(0) : 0;
        if (ratio > 55) {
          console.log(`  ★ ECB ${kc.name} ${targetName}: ${pt.length}B, ASCII ${ratio}% → [${pt.slice(0,20).join(',')}]`);
        }
      } catch(e) {}
    }
  }
}

// 6. 验证 query 参数名
console.log('\n--- 6. 参数名验证 ---');
const keys7 = keys['7'];
if (keys7) {
  const str7 = String.fromCharCode(...keys7);
  const parts = str7.split(';');
  console.log(`  keys[7] = "${str7.substring(0, 80)}..."`);
  console.log(`  split(';')[1] = "${parts[1]}" (期望 r20SZOQm)`);
  console.log(`  split(';')[5] = "${parts[5]}" (cookie 名)`);
}

console.log('\n=== 完成 ===');
