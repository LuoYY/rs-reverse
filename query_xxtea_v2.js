/**
 * query_xxtea_v2.js — XXTEA + 更多 key 组合
 *
 * 从 v1 发现：
 * - 最佳 ASCII 56.3%（_$kP[0:4] on request_data LE）
 * - _$kP = Array(4) = [某个值]，可能是 nonce/IV
 * - 噪声水平 ~37%，56% 稍高但不显著
 *
 * 新策略：
 * 1. _$kP 的实际值需要检查（可能不是 [0,0,0,0]）
 * 2. 尝试 nonce 作为 key 的一部分
 * 3. 尝试 session_data 的前 16 字节作为 request_data 的 key
 * 4. 尝试 cookie 中的值作为 key
 * 5. 尝试更多 key 组合方式
 */

const fs = require('fs'), path = require('path');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

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

function bytesToU32(bytes, endian) {
  const r = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    if (endian === 'LE') r.push(((bytes[i]) | (bytes[i+1] << 8) | (bytes[i+2] << 16) | (bytes[i+3] << 24)) >>> 0);
    else r.push(((bytes[i] << 24) | (bytes[i+1] << 16) | (bytes[i+2] << 8) | (bytes[i+3])) >>> 0);
  }
  return r;
}

function u32ToBytes(arr, endian) {
  const b = [];
  for (const v of arr) {
    if (endian === 'LE') { b.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); }
    else { b.push((v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF); }
  }
  return b;
}

function xxteaDecrypt(v, key) {
  const n = v.length; if (n < 2) return v;
  const DELTA = 0x9E3779B9;
  let q = Math.floor(6 + 52 / n), sum = (q * DELTA) >>> 0, y, z = v[n-1];
  while (sum !== 0) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      z = v[p-1]; y = v[p];
      const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[(p & 3) ^ e] ^ z));
      v[p] = (v[p] - mx) >>> 0;
    }
    z = v[n-1]; y = v[0];
    const mx = (((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (key[0 ^ e] ^ z));
    v[0] = (v[0] - mx) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  return v;
}

function asciiRatio(bytes) {
  if (!bytes.length) return 0;
  return bytes.filter(b => b >= 32 && b <= 126).length / bytes.length;
}

// 加载闭包数据
const arraysData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/send-hook-arrays.json'), 'utf8'));

// 检查 _$kP 的值
console.log('=== _$kP 值 ===');
const kP = arraysData.arrays._$kP;
if (kP) {
  console.log('_$kP:', kP.data);
  console.log('_$kP hex:', kP.data.map(x => '0x' + (x >>> 0).toString(16)));
}

// 加载 query 数据
const queryData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/query-browser-extracted.json'), 'utf8'));
const queries = queryData.queries.filter(q => q.query).map(q => q.query);
console.log('\nQueries:', queries.length);

// 解码所有 query
const decodedQueries = queries.map(q => decode(q, BASESTR));
console.log('Decoded lengths:', decodedQueries.map(b => b.length));

// 拆分结构
function splitStructure(bytes) {
  return {
    nonce: bytes.slice(0, 4),
    header: bytes.slice(4, 7),
    session: bytes.slice(7, 55),
    length: bytes[55],
    request: bytes.slice(56, 88),
    full: bytes,
  };
}

// 构建 key 候选
const keyCandidates = [];

// 1. 闭包数组的前 4 个元素
Object.keys(arraysData.arrays).forEach(name => {
  const d = arraysData.arrays[name].data;
  if (!d || d.length < 4) return;
  if (d.slice(0, 4).every(x => typeof x === 'number' && x >= 0 && x <= 0xFFFFFFFF)) {
    keyCandidates.push({ name: name + '[0:4]', key: d.slice(0, 4).map(x => x >>> 0) });
  }
});

// 2. nonce 作为 key
decodedQueries.forEach((bytes, qi) => {
  const s = splitStructure(bytes);
  // nonce 4 bytes → 1 uint32
  const nonceU32LE = bytesToU32(s.nonce, 'LE')[0];
  const nonceU32BE = bytesToU32(s.nonce, 'BE')[0];
  
  // nonce 扩展为 4 个 uint32
  keyCandidates.push({ name: `nonce${qi}_LE_pad0`, key: [nonceU32LE, 0, 0, 0] });
  keyCandidates.push({ name: `nonce${qi}_LE_repeat`, key: [nonceU32LE, nonceU32LE, nonceU32LE, nonceU32LE] });
  keyCandidates.push({ name: `nonce${qi}_BE_pad0`, key: [nonceU32BE, 0, 0, 0] });
});

// 3. session_data 的前 16 字节作为 request_data 的 key
decodedQueries.forEach((bytes, qi) => {
  const s = splitStructure(bytes);
  const sessionKeyLE = bytesToU32(s.session.slice(0, 16), 'LE');
  const sessionKeyBE = bytesToU32(s.session.slice(0, 16), 'BE');
  keyCandidates.push({ name: `sessionKey${qi}_LE`, key: sessionKeyLE });
  keyCandidates.push({ name: `sessionKey${qi}_BE`, key: sessionKeyBE });
});

// 4. header + nonce 组合
decodedQueries.forEach((bytes, qi) => {
  const s = splitStructure(bytes);
  // nonce(4) + header(3) = 7 bytes → pad to 16
  const combo = [...s.nonce, ...s.header, 0, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 16);
  keyCandidates.push({ name: `nonce+header${qi}_LE`, key: bytesToU32(combo, 'LE') });
});

// 5. cookie 相关 key
// 从 query 数据中获取 cookie
const cookie = queryData.cookie || '';
if (cookie) {
  // P cookie 的值
  const pMatch = cookie.match(/aoU85Lxl9xxNP=([^;]+)/);
  if (pMatch) {
    const pValue = pMatch[1];
    // P cookie 解码（去掉 '0' 前缀后用 basestr 解码）
    const pBytes = decode(pValue, BASESTR);
    if (pBytes.length >= 16) {
      // P cookie 前 16 字节作为 key
      keyCandidates.push({ name: 'pCookie[0:16]_LE', key: bytesToU32(pBytes.slice(0, 16), 'LE') });
      keyCandidates.push({ name: 'pCookie[0:16]_BE', key: bytesToU32(pBytes.slice(0, 16), 'BE') });
      // P cookie 的某一段作为 key
      for (let off = 0; off + 16 <= pBytes.length; off += 4) {
        keyCandidates.push({ name: `pCookie[${off}:${off+16}]_LE`, key: bytesToU32(pBytes.slice(off, off + 16), 'LE') });
      }
    }
  }
}

console.log('\nKey 候选总数:', keyCandidates.length);

// 对 query 0 的 session_data 和 request_data 尝试所有 key
const target = splitStructure(decodedQueries[0]);
let results = [];

keyCandidates.forEach(({ name, key }) => {
  ['LE', 'BE'].forEach(endian => {
    // session_data
    const sData = bytesToU32(target.session, endian);
    const sCopy = [...sData];
    xxteaDecrypt(sCopy, key);
    const sBytes = u32ToBytes(sCopy, endian);
    const sAscii = asciiRatio(sBytes);
    if (sAscii > 0.6) {
      results.push({ ascii: sAscii, key: name, target: 'session', endian, bytes: sBytes });
    }
    
    // request_data
    const rData = bytesToU32(target.request, endian);
    const rCopy = [...rData];
    xxteaDecrypt(rCopy, key);
    const rBytes = u32ToBytes(rCopy, endian);
    const rAscii = asciiRatio(rBytes);
    if (rAscii > 0.6) {
      results.push({ ascii: rAscii, key: name, target: 'request', endian, bytes: rBytes });
    }
  });
});

// 排序
results.sort((a, b) => b.ascii - a.ascii);

console.log('\n=== 高 ASCII 结果（>60%）===');
results.slice(0, 20).forEach(r => {
  console.log(`  ${(r.ascii * 100).toFixed(1)}% ${r.key} on ${r.target} (${r.endian})`);
  console.log(`    str: "${Buffer.from(r.bytes).toString('utf8').substring(0, 60)}"`);
});

if (results.length === 0) {
  console.log('\n  无 >60% ASCII 结果');
  
  // 显示前 5 个最佳
  let allResults = [];
  keyCandidates.forEach(({ name, key }) => {
    ['LE', 'BE'].forEach(endian => {
      const sData = bytesToU32(target.session, endian);
      const sCopy = [...sData];
      xxteaDecrypt(sCopy, key);
      const sAscii = asciiRatio(u32ToBytes(sCopy, endian));
      allResults.push({ ascii: sAscii, key: name, target: 'session', endian });
      
      const rData = bytesToU32(target.request, endian);
      const rCopy = [...rData];
      xxteaDecrypt(rCopy, key);
      const rAscii = asciiRatio(u32ToBytes(rCopy, endian));
      allResults.push({ ascii: rAscii, key: name, target: 'request', endian });
    });
  });
  
  allResults.sort((a, b) => b.ascii - a.ascii);
  console.log('\n  Top 10 最佳:');
  allResults.slice(0, 10).forEach(r => {
    console.log(`    ${(r.ascii * 100).toFixed(1)}% ${r.key} on ${r.target} (${r.endian})`);
  });
}

// 差分分析：同会话多个 query 的 request_data XOR
console.log('\n=== request_data 差分分析 ===');
const reqs = decodedQueries.map(b => splitStructure(b).request);
if (reqs.length >= 2) {
  // 同端点差分
  const sameEndpoint = reqs.slice(0, Math.min(3, reqs.length));
  console.log('  同端点 request_data XOR:');
  for (let i = 1; i < sameEndpoint.length; i++) {
    const xor = sameEndpoint[0].map((b, j) => b ^ sameEndpoint[i][j]);
    const ascii = asciiRatio(xor);
    console.log(`    [0]^[${i}]: ${(ascii * 100).toFixed(0)}% ASCII, hex: ${xor.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  }
  
  // 不同端点差分
  if (reqs.length >= 3) {
    console.log('  不同端点 request_data XOR:');
    for (let i = 1; i < Math.min(reqs.length, 4); i++) {
      const xor = reqs[0].map((b, j) => b ^ reqs[i][j]);
      const ascii = asciiRatio(xor);
      console.log(`    [0]^[${i}]: ${(ascii * 100).toFixed(0)}% ASCII`);
    }
  }
}
