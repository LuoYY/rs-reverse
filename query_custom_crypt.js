/**
 * query_custom_crypt.js — RS 自定义加密分析
 *
 * 关键发现：
 * 1. _$a1 是 basestr 的 charCode→index 解码表（不是 AES S-Box）
 * 2. 常量池包含 AES + XXTEA + MD5 + SHA-1 + CRC32 常数
 * 3. gp[190:209] 的 19 个值（0x81-0xB9 范围）可能是自定义 S-Box 的一部分
 * 4. cookie 用 encryptMode2（RS 自定义 AES-CBC），query 可能用类似但不同的方式
 *
 * 新策略：
 * 1. 用 cookie 的 encryptMode2 来尝试解密 query
 *    - cookie 的 keys16/keys17 已知（cd 解密得到）
 *    - query 的密钥可能和 cookie 的密钥相关
 * 2. 尝试 cookie 的 nextarr 中的值作为 query 密钥
 * 3. 尝试 cookie 本身的加密/解密管线来处理 query
 *
 * 关键：cookie 和 query 使用相同的编码方式（numarr2string + basestr）
 * 它们可能也使用相同的加密核心（RS 自定义 AES），只是密钥不同
 */

const fs = require('fs'), path = require('path');

// RS basestr
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

// numarr2string 解码
function decode(query, basestr) {
  const payload = query.startsWith('0') ? query.slice(1) : query;
  const idxmap = {};
  for (let i = 0; i < basestr.length; i++) { if (!(basestr[i] in idxmap)) idxmap[basestr[i]] = i; }
  const bytes = [];
  let i = 0;
  const full = Math.floor(payload.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = payload.length - i;
  if (rem === 2) bytes.push((idxmap[payload[i]] << 2) | (idxmap[payload[i+1]] >> 4));
  else if (rem === 3) { bytes.push((idxmap[payload[i]] << 2) | (idxmap[payload[i+1]] >> 4)); bytes.push(((idxmap[payload[i+1]] & 15) << 4) | (idxmap[payload[i+2]] >> 2)); }
  return bytes;
}

// RS 自定义 AES-CBC 解密（encryptMode2 的逆操作）
// 从 cookie 逆向中已知 encryptMode2 使用自定义 S-Box
// 这里我们用标准 AES-CBC 作为近似

const crypto = require('crypto');

function aesCbcDecrypt(key, iv, data) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv));
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
}

function aesCbcEncrypt(key, iv, data) {
  const cipher = crypto.createCipheriv('aes-128-cbc', Buffer.from(key), Buffer.from(iv));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
}

// 加载 query 数据
const queryData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/query-browser-extracted.json'), 'utf8'));
const queries = queryData.queries.filter(q => q.query).map(q => q.query);

// 加载闭包数据
const arraysData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/send-hook-arrays.json'), 'utf8'));

// 解码 query
const decoded = queries.map(q => decode(q, BASESTR));
console.log('Decoded queries:', decoded.length, 'length:', decoded[0].length);

// 拆分结构
function split(bytes) {
  return {
    nonce: bytes.slice(0, 4),
    header: bytes.slice(4, 7),
    session: bytes.slice(7, 55),
    lenByte: bytes[55],
    request: bytes.slice(56, 88),
    full: bytes,
  };
}

const parts = decoded.map(split);
console.log('Session data (48B) hex:', parts[0].session.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('Request data (32B) hex:', parts[0].request.map(b => b.toString(16).padStart(2, '0')).join(' '));

// 策略 1: 用 nonce 作为 IV 的 AES-CBC
console.log('\n=== 策略 1: nonce 作为 IV ===');

// 从常量池中提取可能的 16 字节 key
const gp = arraysData.arrays._$gp.data;

// 尝试常量池中连续 16 字节的数字作为 key
// gp[190:209] 有 19 个值（0x81-0xB9），取前 16 个
const customKey1 = gp.slice(190, 206).map(x => x & 0xFF);
console.log('Custom key 1 (gp[190:206]):', customKey1.map(b => b.toString(16).padStart(2, '0')).join(' '));

// 尝试各种 16 字节 key
const keyCandidates = [
  { name: 'gp[190:206]', key: customKey1 },
  { name: 'gp[0:16]', key: gp.slice(0, 16).map(x => x & 0xFF) },
  { name: 'gp[60:76]', key: gp.slice(60, 76).map(x => x & 0xFF) },
];

// session_data 和 request_data 分别解密
parts.forEach((part, qi) => {
  console.log(`\n--- Query ${qi} ---`);
  
  // IV 候选
  const ivCandidates = [
    { name: 'zeros', iv: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
    { name: 'nonce_pad', iv: [...part.nonce, 0,0,0,0,0,0,0,0,0,0,0,0] },
    { name: 'nonce_repeat', iv: [...part.nonce, ...part.nonce, ...part.nonce, ...part.nonce] },
    { name: 'header_pad', iv: [...part.nonce, ...part.header, 0,0,0,0,0,0,0,0,0] },
  ];
  
  keyCandidates.forEach(({ name: kName, key }) => {
    ivCandidates.forEach(({ name: iName, iv }) => {
      // session_data (48B = 3 blocks)
      try {
        const sDec = aesCbcDecrypt(key, iv, part.session);
        const sAscii = [...sDec].filter(b => b >= 32 && b <= 126).length / sDec.length;
        if (sAscii > 0.6) {
          console.log(`  ★ session ${kName}/${iName}: ${(sAscii*100).toFixed(0)}% ASCII`);
          console.log(`    "${sDec.toString('utf8').substring(0, 48)}"`);
        }
      } catch(e) {}
      
      // request_data (32B = 2 blocks)
      try {
        const rDec = aesCbcDecrypt(key, iv, part.request);
        const rAscii = [...rDec].filter(b => b >= 32 && b <= 126).length / rDec.length;
        if (rAscii > 0.6) {
          console.log(`  ★ request ${kName}/${iName}: ${(rAscii*100).toFixed(0)}% ASCII`);
          console.log(`    "${rDec.toString('utf8').substring(0, 32)}"`);
        }
      } catch(e) {}
    });
  });
});

// 策略 2: session_data 的前 16 字节作为 request_data 的 key
console.log('\n=== 策略 2: session→request key ===');
parts.forEach((part, qi) => {
  const sessionKey = part.session.slice(0, 16);
  const ivs = [
    { name: 'zeros', iv: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
    { name: 'nonce_pad', iv: [...part.nonce, 0,0,0,0,0,0,0,0,0,0,0,0] },
  ];
  
  ivs.forEach(({ name: iName, iv }) => {
    try {
      const rDec = aesCbcDecrypt(sessionKey, iv, part.request);
      const rAscii = [...rDec].filter(b => b >= 32 && b <= 126).length / rDec.length;
      if (rAscii > 0.5) {
        console.log(`  Q${qi} request sessionKey/${iName}: ${(rAscii*100).toFixed(0)}% ASCII`);
        console.log(`    "${rDec.toString('utf8').substring(0, 32)}"`);
      }
    } catch(e) {}
  });
});

// 策略 3: 完整 88 字节用不同方式拆分
console.log('\n=== 策略 3: 不同拆分方式 ===');

// 可能 query 不是 [nonce 4B][header 3B][session 48B][len 1B][request 32B]
// 而是其他结构

// 尝试：[nonce 16B][payload 72B] — nonce 作为完整的 AES IV
const nonce16 = [...parts[0].nonce, ...parts[0].header, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const payload72 = decoded[0].slice(7); // 去掉 nonce+header
console.log('nonce16:', nonce16.map(b => b.toString(16).padStart(2,'0')).join(' '));
console.log('payload72 length:', payload72.length);

// 72 不是 16 的倍数，不能直接 AES-CBC

// 尝试：整个 88 字节是 [IV 16B][ciphertext 72B]
// 但 72 不是 16 的倍数

// 尝试：[nonce 4B][version 1B][type 1B][len 1B][IV 16B][ciphertext 64B]
// 4+1+1+1+16+64 = 87 ≠ 88
// 或者 [nonce 4B][version 1B][type 1B][len 1B][IV 16B][ciphertext 65B]
// 也不对

// 尝试：session_data 的前 16 字节是 IV，后 32 字节是密文
console.log('\nsession 拆分为 IV(16) + ciphertext(32):');
const sessionIV = parts[0].session.slice(0, 16);
const sessionCT = parts[0].session.slice(16, 48); // 32 bytes
console.log('session IV:', sessionIV.map(b => b.toString(16).padStart(2,'0')).join(' '));
console.log('session CT:', sessionCT.map(b => b.toString(16).padStart(2,'0')).join(' '));

keyCandidates.forEach(({ name: kName, key }) => {
  try {
    const dec = aesCbcDecrypt(key, sessionIV, sessionCT);
    const ascii = [...dec].filter(b => b >= 32 && b <= 126).length / dec.length;
    if (ascii > 0.5) {
      console.log(`  ★ session CT ${kName}: ${(ascii*100).toFixed(0)}% ASCII`);
      console.log(`    "${dec.toString('utf8').substring(0, 32)}"`);
    }
  } catch(e) {}
});

// 策略 4: 用 cookie 的 P cookie 值提取 key
console.log('\n=== 策略 4: P cookie 派生 key ===');

// 从 queryData 中获取 cookie
const cookie = queryData.cookie || '';
if (cookie) {
  const pMatch = cookie.match(/aoU85Lxl9xxNP=([^;]+)/);
  if (pMatch) {
    const pValue = pMatch[1];
    const pBytes = decode(pValue, BASESTR);
    console.log('P cookie decoded:', pBytes.length, 'bytes');
    
    // P cookie 结构（从 cookie 逆向中已知）：
    // AES-CBC(keys16) 解密 → nextarr
    // nextarr 包含 keys2, basearrEncrypt 等
    
    // 尝试 P cookie 的不同段作为 query key
    for (let off = 0; off + 16 <= pBytes.length; off += 4) {
      const pKey = pBytes.slice(off, off + 16);
      const ivs = [[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]];
      
      for (const iv of ivs) {
        try {
          // session
          const sDec = aesCbcDecrypt(pKey, iv, parts[0].session);
          const sAscii = [...sDec].filter(b => b >= 32 && b <= 126).length / sDec.length;
          if (sAscii > 0.7) {
            console.log(`  ★ session P[${off}:${off+16}]: ${(sAscii*100).toFixed(0)}% ASCII`);
            console.log(`    "${sDec.toString('utf8').substring(0, 48)}"`);
          }
          // request
          const rDec = aesCbcDecrypt(pKey, iv, parts[0].request);
          const rAscii = [...rDec].filter(b => b >= 32 && b <= 126).length / rDec.length;
          if (rAscii > 0.7) {
            console.log(`  ★ request P[${off}:${off+16}]: ${(rAscii*100).toFixed(0)}% ASCII`);
            console.log(`    "${rDec.toString('utf8').substring(0, 32)}"`);
          }
        } catch(e) {}
      }
    }
  }
}

// 策略 5: AES-ECB（不需要 IV）
console.log('\n=== 策略 5: AES-ECB ===');

function aesEcbDecrypt(key, data) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(key), Buffer.alloc(0));
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(Buffer.from(data)), decipher.final()]);
}

keyCandidates.forEach(({ name: kName, key }) => {
  try {
    const sDec = aesEcbDecrypt(key, parts[0].session);
    const sAscii = [...sDec].filter(b => b >= 32 && b <= 126).length / sDec.length;
    if (sAscii > 0.5) {
      console.log(`  ★ session ECB ${kName}: ${(sAscii*100).toFixed(0)}% ASCII`);
      console.log(`    "${sDec.toString('utf8').substring(0, 48)}"`);
    }
  } catch(e) {}
  
  try {
    const rDec = aesEcbDecrypt(key, parts[0].request);
    const rAscii = [...rDec].filter(b => b >= 32 && b <= 126).length / rDec.length;
    if (rAscii > 0.5) {
      console.log(`  ★ request ECB ${kName}: ${(rAscii*100).toFixed(0)}% ASCII`);
      console.log(`    "${rDec.toString('utf8').substring(0, 32)}"`);
    }
  } catch(e) {}
});

// 策略 6: 检查 query 是否是 Huffman 编码（类似 cookie）
console.log('\n=== 策略 6: 检查 Huffman 编码 ===');
// cookie 的加密链路：basearr → huffman → xor → AES
// query 可能也用 huffman
// huffman 编码的特征：某些字节频率很高

const sessionFreq = {};
parts[0].session.forEach(b => { sessionFreq[b] = (sessionFreq[b] || 0) + 1; });
const sortedFreq = Object.entries(sessionFreq).sort((a, b) => b[1] - a[1]);
console.log('Session data byte frequency (top 10):');
sortedFreq.slice(0, 10).forEach(([byte, count]) => {
  console.log(`  0x${parseInt(byte).toString(16).padStart(2, '0')}: ${count}`);
});

// 如果是 Huffman 编码，应该有少数字节频率很高
const maxFreq = sortedFreq[0] ? sortedFreq[0][1] : 0;
console.log(`Max frequency: ${maxFreq}/${parts[0].session.length} = ${(maxFreq/parts[0].session.length*100).toFixed(0)}%`);
if (maxFreq > 10) {
  console.log('  → 有高频字节，可能包含 Huffman 编码');
} else {
  console.log('  → 无明显高频字节，不像 Huffman 编码');
}

console.log('\n=== 完成 ===');
