/**
 * query_key_from_cookie.js — 从 O/P cookie 派生 query 加密密钥
 *
 * 推理：服务器需要解密 query，但服务器没有 RS 动态代码。
 * 所以 query 密钥必须从服务器已知的信息派生：
 * - O cookie（服务器设置的）
 * - P cookie（服务器验证的）
 * - nsd/cd（服务器生成的）
 *
 * 已排除：cd 解密的所有 45 个 keys
 * 尝试：O cookie bytes / P cookie bytes / cookie 派生值作为 AES key
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname;

// 加载之前捕获的数据
const dataPath = path.join(ROOT, 'output/capture-20080/query-diff-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('=== 从 O/P cookie 派生 query 密钥 ===\n');

const q0 = data.queries[0];
const sessionData = q0.bytes.slice(7, 55); // 48 bytes
const requestData = q0.bytes.slice(56, 88); // 32 bytes
const nonce = q0.bytes.slice(0, 4); // 4 bytes

console.log('Session data (48B):', sessionData.slice(0, 10).join(',') + '...');
console.log('Request data (32B):', requestData.slice(0, 10).join(',') + '...');
console.log('Nonce (4B):', nonce.join(','));
console.log('O cookie:', data.oCookie?.substring(0, 40) + '...');
console.log('P cookie:', data.pCookie?.substring(0, 40) + '...');

// basestr decode function
const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
const idxmap = {};
basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

function decodeCookie(cookieStr) {
  // Cookie value starts with '0' prefix, then basestr64 encoded
  const val = cookieStr.split('=')[1];
  if (!val) return [];
  const payload = val.startsWith('0') ? val.slice(1) : val;
  const bytes = [];
  let i = 0;
  const full = Math.floor(payload.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4; bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  const rem = payload.length - i;
  if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem === 3) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4), ((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));
  return bytes;
}

// Decode O and P cookies
const oCookieStr = data.oCookie || '';
const pCookieStr = (data.pName || 'aoU85Lxl9xxNP') + '=' + (data.cookie || '');

console.log('\nDecoding cookies...');
const oBytes = decodeCookie(oCookieStr);
const pBytes = decodeCookie(pCookieStr);
console.log(`O cookie decoded: ${oBytes.length} bytes`);
console.log(`P cookie decoded: ${pBytes.length} bytes`);

// AES-CBC decrypt
const crypto = require('crypto');
function aesCbcDecrypt(data, key, iv) {
  try {
    const dec = crypto.createDecipheriv('aes-' + (key.length * 8) + '-cbc', Buffer.from(key), Buffer.from(iv));
    dec.setAutoPadding(false);
    return Array.from(Buffer.concat([dec.update(Buffer.from(data)), dec.final()]));
  } catch (e) { return null; }
}

function asciiRatio(bytes) {
  if (!bytes) return 0;
  const count = bytes.filter(b => b >= 32 && b <= 126).length;
  return count / bytes.length;
}

// 生成候选密钥列表
const candidates = [];

// 1. O cookie 原始字节的不同切片
for (let offset = 0; offset < Math.min(oBytes.length, 48); offset += 4) {
  if (offset + 16 <= oBytes.length) candidates.push({ name: `O[${offset}:${offset+16}]`, key: oBytes.slice(offset, offset+16) });
  if (offset + 32 <= oBytes.length) candidates.push({ name: `O[${offset}:${offset+32}]`, key: oBytes.slice(offset, offset+32) });
}

// 2. P cookie 原始字节的不同切片
for (let offset = 0; offset < Math.min(pBytes.length, 48); offset += 4) {
  if (offset + 16 <= pBytes.length) candidates.push({ name: `P[${offset}:${offset+16}]`, key: pBytes.slice(offset, offset+16) });
  if (offset + 32 <= pBytes.length) candidates.push({ name: `P[${offset}:${offset+32}]`, key: pBytes.slice(offset, offset+32) });
}

// 3. P cookie 解密后的字节（用 keys16 解密外层）
if (data.keys && data.keys['16']) {
  const keys16 = data.keys['16'];
  // 用 keys16 flag=1 解密 P cookie
  // encryptMode2 的 flag=1: IV = first 16 bytes, decrypt rest
  const pDecrypted = aesCbcDecrypt(pBytes.slice(16), keys16, pBytes.slice(0, 16));
  if (pDecrypted) {
    console.log(`\nP cookie decrypted with keys16: ${pDecrypted.length} bytes`);
    // P cookie 内层结构: [uuid 4B][nextarr...]
    // nextarr 中的某些字节可能是 query 密钥
    for (let offset = 0; offset < Math.min(pDecrypted.length, 200); offset += 4) {
      if (offset + 16 <= pDecrypted.length) {
        candidates.push({ name: `Pdec[${offset}:${offset+16}]`, key: pDecrypted.slice(offset, offset+16) });
      }
    }
  }
}

// 4. O cookie 和 P cookie 的组合
if (oBytes.length >= 16 && pBytes.length >= 16) {
  // O+P XOR
  const xorKey = [];
  for (let i = 0; i < 16; i++) xorKey.push(oBytes[i] ^ pBytes[i]);
  candidates.push({ name: 'O^P[0:16]', key: xorKey });
}

// 5. P cookie 的 nextarr 中的特定字段
// nextarr = numarrJoin(2, time, keys2, 128, basearrEncrypt)
// bytes[0] = 2 (scalar)
// bytes[1..8] = time (r2mkaTime + startTime)
// bytes[9..56] = keys2 (48 bytes)
// bytes[57] = 128 (high byte)
// bytes[58..281] = basearrEncrypt (224 bytes)
if (data.keys && data.keys['2']) {
  // keys2 is already in the candidates from cd keys
  // But let's also try keys2 from the P cookie's nextarr
}

// 6. nonce + O cookie 组合
if (oBytes.length >= 12) {
  const nonceKey = [...nonce, ...oBytes.slice(0, 12)];
  candidates.push({ name: 'nonce+O[0:12]', key: nonceKey });
}

console.log(`\nTotal key candidates: ${candidates.length}`);

// 尝试每个候选密钥
console.log('\n=== 尝试解密 session_data ===');
let sessionHits = [];
for (const cand of candidates) {
  if (cand.key.length !== 16 && cand.key.length !== 32) continue;

  // flag=0: IV = zeros
  const dec0 = aesCbcDecrypt(sessionData, cand.key, new Array(16).fill(0));
  if (dec0) {
    const ratio = asciiRatio(dec0);
    if (ratio > 0.5) {
      sessionHits.push({ ...cand, flag: 0, ratio, decrypted: dec0 });
    }
  }

  // flag=1: IV = first 16 bytes of sessionData
  const dec1 = aesCbcDecrypt(sessionData.slice(16), cand.key, sessionData.slice(0, 16));
  if (dec1) {
    const ratio = asciiRatio(dec1);
    if (ratio > 0.5) {
      sessionHits.push({ ...cand, flag: 1, ratio, decrypted: dec1 });
    }
  }

  // nonce as IV (padded)
  const nonceIv = [...nonce, ...new Array(12).fill(0)];
  const decN = aesCbcDecrypt(sessionData, cand.key, nonceIv);
  if (decN) {
    const ratio = asciiRatio(decN);
    if (ratio > 0.5) {
      sessionHits.push({ ...cand, flag: 'nonce', ratio, decrypted: decN });
    }
  }
}

console.log(`Session hits: ${sessionHits.length}`);
sessionHits.sort((a, b) => b.ratio - a.ratio);
sessionHits.slice(0, 10).forEach(h => {
  console.log(`  ${h.name} flag=${h.flag} ascii=${(h.ratio*100).toFixed(0)}%`);
  console.log(`    decrypted: [${h.decrypted.slice(0, 16).join(',')}]`);
  const text = h.decrypted.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
  if (text.length > 3) console.log(`    text: ${text.substring(0, 50)}`);
});

// 也尝试 request_data
console.log('\n=== 尝试解密 request_data ===');
let requestHits = [];
for (const cand of candidates) {
  if (cand.key.length !== 16 && cand.key.length !== 32) continue;

  const dec0 = aesCbcDecrypt(requestData, cand.key, new Array(16).fill(0));
  if (dec0) {
    const ratio = asciiRatio(dec0);
    if (ratio > 0.5) requestHits.push({ ...cand, flag: 0, ratio, decrypted: dec0 });
  }

  const dec1 = aesCbcDecrypt(requestData.slice(16), cand.key, requestData.slice(0, 16));
  if (dec1) {
    const ratio = asciiRatio(dec1);
    if (ratio > 0.5) requestHits.push({ ...cand, flag: 1, ratio, decrypted: dec1 });
  }

  const nonceIv = [...nonce, ...new Array(12).fill(0)];
  const decN = aesCbcDecrypt(requestData, cand.key, nonceIv);
  if (decN) {
    const ratio = asciiRatio(decN);
    if (ratio > 0.5) requestHits.push({ ...cand, flag: 'nonce', ratio, decrypted: decN });
  }
}

console.log(`Request hits: ${requestHits.length}`);
requestHits.sort((a, b) => b.ratio - a.ratio);
requestHits.slice(0, 10).forEach(h => {
  console.log(`  ${h.name} flag=${h.flag} ascii=${(h.ratio*100).toFixed(0)}%`);
  console.log(`    decrypted: [${h.decrypted.slice(0, 16).join(',')}]`);
  const text = h.decrypted.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
  if (text.length > 3) console.log(`    text: ${text.substring(0, 50)}`);
});

// 6. 也尝试 XOR（非 AES）
console.log('\n=== 尝试 XOR 解密 ===');
for (const cand of candidates) {
  if (cand.key.length < 16) continue;

  // XOR session_data with key (cycling)
  const xored = sessionData.map((b, i) => b ^ cand.key[i % cand.key.length]);
  const ratio = asciiRatio(xored);
  if (ratio > 0.6) {
    console.log(`  XOR session ${cand.name}: ascii=${(ratio*100).toFixed(0)}%`);
    const text = xored.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
    console.log(`    text: ${text.substring(0, 50)}`);
  }

  // XOR request_data
  const xoredReq = requestData.map((b, i) => b ^ cand.key[i % cand.key.length]);
  const ratioReq = asciiRatio(xoredReq);
  if (ratioReq > 0.6) {
    console.log(`  XOR request ${cand.name}: ascii=${(ratioReq*100).toFixed(0)}%`);
    const text = xoredReq.filter(b => b >= 32 && b <= 126).map(b => String.fromCharCode(b)).join('');
    console.log(`    text: ${text.substring(0, 50)}`);
  }
}

// 7. 尝试 P cookie 解密后的 nextarr 中的 keys2
console.log('\n=== 从 P cookie nextarr 提取 keys2 ===');
if (data.keys && data.keys['16'] && data.keys['2']) {
  const keys16 = data.keys['16'];
  const keys2 = data.keys['2'];

  // 解密 P cookie 外层
  const pDec = aesCbcDecrypt(pBytes.slice(16), keys16, pBytes.slice(0, 16));
  if (pDec) {
    // nextarr = pDec[4:] (skip uuid)
    const nextarr = pDec.slice(4);
    console.log(`nextarr length: ${nextarr.length}`);

    // nextarr 结构: [2][time 8B][keys2 48B][128][basearrEncrypt 224B]
    // keys2 在 nextarr[9..56] (48 bytes)
    const nextarrKeys2 = nextarr.slice(9, 57);
    console.log(`nextarr keys2: ${nextarrKeys2.length} bytes`);
    console.log(`cd keys2: ${keys2.length} bytes`);
    console.log(`Match: ${JSON.stringify(nextarrKeys2) === JSON.stringify(keys2)}`);

    // 也尝试 nextarr 中的其他字段
    // time bytes
    const timeBytes = nextarr.slice(1, 9);
    console.log(`time bytes: [${timeBytes.join(',')}]`);

    // 尝试用 time bytes 作为 key
    if (timeBytes.length >= 16) {
      // 不够 16 字节，但可以重复
    }

    // basearrEncrypt
    const basearrEncrypt = nextarr.slice(58);
    console.log(`basearrEncrypt: ${basearrEncrypt.length} bytes`);

    // 尝试用 basearrEncrypt 的切片作为 key
    for (let off = 0; off < basearrEncrypt.length; off += 16) {
      if (off + 16 <= basearrEncrypt.length) {
        const key = basearrEncrypt.slice(off, off + 16);
        const dec = aesCbcDecrypt(sessionData, key, new Array(16).fill(0));
        if (dec) {
          const ratio = asciiRatio(dec);
          if (ratio > 0.5) {
            console.log(`  *** basearrEncrypt[${off}:${off+16}] as key: ascii=${(ratio*100).toFixed(0)}% ***`);
          }
        }
      }
    }
  }
}

console.log('\n=== 完成 ===');
