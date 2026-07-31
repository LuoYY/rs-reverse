/**
 * query_xxtea_decrypt.js — 用 XXTEA + 闭包密钥尝试解密 query
 *
 * 已知：
 * 1. RS 常量池包含 XXTEA delta (0x9e3779b9)
 * 2. basestr 已提取
 * 3. 闭包数组已提取（39 个）
 * 4. query 结构：88 字节 = [nonce 4B][1][0][48][session 48B][32][request 32B]
 *
 * 策略：
 * 1. 用 basestr 解码 query → 88 字节
 * 2. 将 88 字节转为 uint32 数组（22 个）
 * 3. 用闭包中的每个数组作为 XXTEA key 尝试解密
 * 4. 检查解密结果是否为可读 ASCII
 *
 * XXTEA 算法：
 * - 输入：n 个 uint32（n >= 2）
 * - key：4 个 uint32（128 bit）
 * - delta = 0x9E3779B9
 */

const fs = require('fs'), path = require('path');

// RS basestr（从浏览器闭包提取）
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

// 从浏览器捕获的 query 值
const QUERIES = [
  // 会话 1
  "05HAY6qlqWkwj85ekFzuvZ2dkbbR895KdbRNi9eQv6nDpOMVbhdKHfeFG.l5jpGGJss2rDFo5Onr_pNFIdzyl6m.Xdzu4AokWrVV.LaRcnKT8LcgPHW80_G",
  "0KQHedAlqWkwj85ekFzuvZ2dkbbR895KdbRNi9eQv6nDpOMVbhdKHfeFG.l5jpGGJss2rDFo5Onr4EuoKzuXgMi9qtVNCZkWlPQtXlK.ivkCy5owO1.cz5A",
  "0icxp4AlqWkwj85ekFzuvZ2dkbbR895KdbRNi9eQv6nDpOMVbhdKHfeFG.l5jpGGJss2rDFo5Onc40pDI5TSQ0bF8Tpd.QiC5_HaX.5ei94Nc1Cp4y6V4Yq",
];

// numarr2string 解码（basestr → bytes）
function decode(query, basestr) {
  // 去掉 '0' 前缀
  const payload = query.startsWith('0') ? query.slice(1) : query;
  
  // 构建 char → index 映射
  const idxmap = {};
  for (let i = 0; i < basestr.length; i++) {
    if (!(basestr[i] in idxmap)) idxmap[basestr[i]] = i;
  }
  
  const bytes = [];
  let i = 0;
  const full = Math.floor(payload.length / 4);
  
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[payload[i]];
    const c1 = idxmap[payload[i + 1]];
    const c2 = idxmap[payload[i + 2]];
    const c3 = idxmap[payload[i + 3]];
    i += 4;
    bytes.push((c0 << 2) | (c1 >> 4));
    bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    bytes.push(((c2 & 3) << 6) | c3);
  }
  
  // 处理余数
  const rem = payload.length - i;
  if (rem === 2) {
    bytes.push((idxmap[payload[i]] << 2) | (idxmap[payload[i + 1]] >> 4));
  } else if (rem === 3) {
    bytes.push((idxmap[payload[i]] << 2) | (idxmap[payload[i + 1]] >> 4));
    bytes.push(((idxmap[payload[i + 1]] & 15) << 4) | (idxmap[payload[i + 2]] >> 2));
  }
  
  return bytes;
}

// bytes → uint32 数组（小端）
function bytesToUint32LE(bytes) {
  const result = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    result.push(
      (bytes[i] & 0xFF) |
      ((bytes[i + 1] & 0xFF) << 8) |
      ((bytes[i + 2] & 0xFF) << 16) |
      ((bytes[i + 3] & 0xFF) << 24)
    );
    result[result.length - 1] = result[result.length - 1] >>> 0; // unsigned
  }
  return result;
}

// bytes → uint32 数组（大端）
function bytesToUint32BE(bytes) {
  const result = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    result.push(
      ((bytes[i] & 0xFF) << 24) |
      ((bytes[i + 1] & 0xFF) << 16) |
      ((bytes[i + 2] & 0xFF) << 8) |
      (bytes[i + 3] & 0xFF)
    );
    result[result.length - 1] = result[result.length - 1] >>> 0;
  }
  return result;
}

// uint32 → bytes（小端）
function uint32ToBytesLE(arr) {
  const bytes = [];
  for (const v of arr) {
    bytes.push(v & 0xFF);
    bytes.push((v >>> 8) & 0xFF);
    bytes.push((v >>> 16) & 0xFF);
    bytes.push((v >>> 24) & 0xFF);
  }
  return bytes;
}

// uint32 → bytes（大端）
function uint32ToBytesBE(arr) {
  const bytes = [];
  for (const v of arr) {
    bytes.push((v >>> 24) & 0xFF);
    bytes.push((v >>> 16) & 0xFF);
    bytes.push((v >>> 8) & 0xFF);
    bytes.push(v & 0xFF);
  }
  return bytes;
}

// XXTEA 解密
function xxteaDecrypt(v, key) {
  // v: uint32 array (n >= 2)
  // key: uint32 array (4 elements)
  const n = v.length;
  if (n < 2) return v;
  
  const DELTA = 0x9E3779B9;
  
  let q = Math.floor(6 + 52 / n);
  let sum = (q * DELTA) >>> 0;
  let y, z = v[n - 1];
  
  while (sum !== 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      z = v[p - 1];
      const mx = (((z >>> 5) ^ (y = v[p]) << 2) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z));
      v[p] = (v[p] - mx) >>> 0;
    }
    z = v[n - 1];
    const mx = (((z >>> 5) ^ (y = v[0]) << 2) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(0 & 3) ^ e] ^ z));
    v[0] = (v[0] - mx) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  
  return v;
}

// 计算数组的 ASCII 比率
function asciiRatio(bytes) {
  if (bytes.length === 0) return 0;
  let count = 0;
  for (const b of bytes) {
    if (b >= 32 && b <= 126) count++;
  }
  return count / bytes.length;
}

// 加载数据
const arraysData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/send-hook-arrays.json'), 'utf8'));

// 提取所有可能的 key 候选
const keyCandidates = [];

// 从闭包数组中提取 4 元素 uint32 key
Object.keys(arraysData.arrays).forEach(name => {
  const arr = arraysData.arrays[name];
  const data = arr.data;
  if (!data || data.length < 4) return;
  
  // 检查是否全是数字
  if (data.every(x => typeof x === 'number' && x >= 0)) {
    // 尝试将前 4 个数字作为 uint32 key
    if (data.length >= 4) {
      const key = [
        data[0] >>> 0,
        data[1] >>> 0,
        data[2] >>> 0,
        data[3] >>> 0,
      ];
      // 确保是有效的 uint32
      if (key.every(k => k >= 0 && k <= 0xFFFFFFFF)) {
        keyCandidates.push({ name: name + '[0:4]', key: key });
      }
    }
  }
});

// 也从常量池中提取已知常数作为 key
const knownKeys = {
  'md5_init': [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476],
  'sha1_init': [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476],
};

Object.keys(knownKeys).forEach(name => {
  keyCandidates.push({ name: name, key: knownKeys[name] });
});

console.log('=== XXTEA 解密尝试 ===\n');
console.log('Key 候选数:', keyCandidates.length);
console.log('Query 数:', QUERIES.length);

// 解码 query 1
const query1 = QUERIES[0];
const bytes1 = decode(query1, BASESTR);
console.log('\nQuery 1 decoded:', bytes1.length, 'bytes');
console.log('Hex:', bytes1.map(b => b.toString(16).padStart(2, '0')).join(' '));

// 拆分结构
const nonce = bytes1.slice(0, 4);
const header = bytes1.slice(4, 7); // [1, 0, 48]
const sessionData = bytes1.slice(7, 55); // 48 bytes
const lengthByte = bytes1[55]; // 32
const requestData = bytes1.slice(56, 88); // 32 bytes

console.log('\n结构拆分:');
console.log('  nonce [0:4]:', nonce.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('  header [4:7]:', header);
console.log('  session_data [7:55] (48B):', sessionData.map(b => b.toString(16).padStart(2, '0')).join(' '));
console.log('  length [55]:', lengthByte);
console.log('  request_data [56:88] (32B):', requestData.map(b => b.toString(16).padStart(2, '0')).join(' '));

// 尝试 XXTEA 解密
console.log('\n=== XXTEA 解密 ===\n');

// 对 session_data (48B = 12 uint32) 和 request_data (32B = 8 uint32) 分别解密
const sessionLE = bytesToUint32LE(sessionData);
const sessionBE = bytesToUint32BE(sessionData);
const requestLE = bytesToUint32LE(requestData);
const requestBE = bytesToUint32BE(requestData);

console.log('session_data uint32 LE:', sessionLE.map(x => '0x' + x.toString(16)));
console.log('session_data uint32 BE:', sessionBE.map(x => '0x' + x.toString(16)));
console.log('request_data uint32 LE:', requestLE.map(x => '0x' + x.toString(16)));
console.log('request_data uint32 BE:', requestBE.map(x => '0x' + x.toString(16)));

let bestResult = { ascii: 0, key: null, target: null, endian: null };

keyCandidates.forEach(({ name, key }) => {
  ['LE', 'BE'].forEach(endian => {
    // session_data
    [['session', sessionLE], ['session_BE', sessionBE], ['request', requestLE], ['request_BE', requestBE]].forEach(([target, data]) => {
      const v = [...data]; // copy
      xxteaDecrypt(v, key);
      const bytes = endian === 'LE' ? uint32ToBytesLE(v) : uint32ToBytesBE(v);
      const ascii = asciiRatio(bytes);
      
      if (ascii > bestResult.ascii) {
        bestResult = { ascii, key: name, target, endian, result: bytes.slice(0, 48) };
      }
      
      if (ascii > 0.7) {
        console.log(`\n★ ${name} on ${target} (${endian}): ${(ascii * 100).toFixed(0)}% ASCII`);
        console.log('  result:', Buffer.from(bytes).toString('utf8').substring(0, 80));
      }
    });
  });
});

console.log('\n=== 最佳结果 ===');
console.log('ASCII:', (bestResult.ascii * 100).toFixed(1) + '%');
console.log('Key:', bestResult.key);
console.log('Target:', bestResult.target);
console.log('Endian:', bestResult.endian);
if (bestResult.result) {
  console.log('Result hex:', bestResult.result.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('Result str:', Buffer.from(bestResult.result).toString('utf8').substring(0, 80));
}

// 也对完整 88 字节尝试 XXTEA
console.log('\n=== 完整 88 字节 XXTEA ===');
const fullLE = bytesToUint32LE(bytes1);
const fullBE = bytesToUint32BE(bytes1);

let bestFull = { ascii: 0, key: null };

keyCandidates.forEach(({ name, key }) => {
  [['LE', fullLE], ['BE', fullBE]].forEach(([endian, data]) => {
    const v = [...data];
    xxteaDecrypt(v, key);
    const bytes = endian === 'LE' ? uint32ToBytesLE(v) : uint32ToBytesBE(v);
    const ascii = asciiRatio(bytes);
    
    if (ascii > bestFull.ascii) {
      bestFull = { ascii, key: name, endian, result: bytes };
    }
    
    if (ascii > 0.7) {
      console.log(`★ ${name} (${endian}): ${(ascii * 100).toFixed(0)}% ASCII`);
      console.log('  result:', Buffer.from(bytes).toString('utf8').substring(0, 80));
    }
  });
});

console.log('\n最佳完整结果:', (bestFull.ascii * 100).toFixed(1) + '%', 'key:', bestFull.key);
