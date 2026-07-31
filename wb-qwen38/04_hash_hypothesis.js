/**
 * 04_hash_hypothesis.js
 * 
 * 全新假设测试：
 * 
 * 假设 A：session_data(48B) = SHA-384(session_info)，request_data(32B) = SHA-256(request_info)
 *   - SHA-384 输出恰好 48 字节！SHA-256 输出恰好 32 字节！
 *   - 如果是哈希，所有解密尝试必然失败（单向函数）
 * 
 * 假设 B：XXTEA 加密（同会话 keys）
 *   - 之前用不同会话 keys 测试失败，这次用同会话
 * 
 * 假设 C：数据未加密，是某种编码/混淆
 *   - 检查字节分布、熵值
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function crc32(numarr) {
  const table = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  let val = 0 ^ -1;
  for (let i = 0; i < numarr.length; i++) val = (val >>> 8) ^ table[(val ^ numarr[i]) & 255];
  return (val ^ -1) >>> 0;
}

// XXTEA 实现
function xxteaDecrypt(v, key) {
  // v: uint32 array, key: 4 uint32s
  const DELTA = 0x9E3779B9;
  const n = v.length;
  if (n < 2) return v;
  
  let rounds = Math.floor(6 + 52 / n);
  let sum = (Math.imul(rounds, DELTA)) >>> 0;
  let y = v[0];
  let z;
  
  while (rounds > 0) {
    z = v[n - 1];
    for (let p = n - 1; p > 0; p--) {
      z = v[p - 1];
      const e = (sum >>> 2) & 3;
      const k = key[e];
      v[p] = (v[p] - (((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k ^ z)))) >>> 0;
      y = v[p];
    }
    z = v[n - 1];
    const e = (sum >>> 2) & 3;
    const k = key[e];
    v[0] = (v[0] - (((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k ^ z)))) >>> 0;
    y = v[0];
    sum = (sum - DELTA) >>> 0;
    rounds--;
  }
  return v;
}

function bytesToUint32LE(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i += 4) {
    result.push((arr[i] | (arr[i+1] << 8) | (arr[i+2] << 16) | (arr[i+3] << 24)) >>> 0);
  }
  return result;
}

function bytesToUint32BE(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i += 4) {
    result.push(((arr[i] << 24) | (arr[i+1] << 16) | (arr[i+2] << 8) | arr[i+3]) >>> 0);
  }
  return result;
}

function uint32ToBytesLE(arr) {
  const result = [];
  for (const v of arr) {
    result.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  return result;
}

function uint32ToBytesBE(arr) {
  const result = [];
  for (const v of arr) {
    result.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }
  return result;
}

// 计算信息熵
function entropy(arr) {
  const freq = new Array(256).fill(0);
  for (const b of arr) freq[b]++;
  let ent = 0;
  for (const f of freq) {
    if (f > 0) {
      const p = f / arr.length;
      ent -= p * Math.log2(p);
    }
  }
  return ent;
}

// ============ 主逻辑 ============

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));
const keys = data.keys;

const queries = data.queries.map((q, i) => {
  const bytes = string2numarr(q.query.substring(1));
  return {
    idx: i, method: q.method, path: q.path, bytes,
    session: bytes.slice(7, 55),
    request: bytes.slice(56, 88),
  };
});

console.log('=== 假设测试 ===\n');

// ============ 假设 C：熵分析 ============
console.log('--- 假设 C：信息熵分析 ---');
const session0 = queries[0].session;
const request0 = queries[0].request;
console.log(`  session_data 熵: ${entropy(session0).toFixed(3)} bits/byte (最大 8.0, 随机 ~7.5+)`);
console.log(`  request_data 熵: ${entropy(request0).toFixed(3)} bits/byte`);
console.log(`  高熵 = 加密/哈希，低熵 = 编码/结构化数据`);

// 字节值分布
const sessionHist = new Array(16).fill(0);
for (const b of session0) sessionHist[b >> 4]++;
console.log(`  session_data 高半字节分布: [${sessionHist.join(',')}]`);

// ============ 假设 A：SHA 哈希 ============
console.log('\n--- 假设 A：SHA 哈希测试 ---');

const keys16 = keys['16'];
const keys17 = keys['17'];
const keys2 = keys['2'];

// P cookie 和解码后的字节
const pCookieBytes = data.cookie ? string2numarr(data.cookie.substring(1)) : [];
const oCookieVal = data.oCookie ? data.oCookie.split('=').slice(1).join('=') : '';
const oCookieBytes = oCookieVal ? string2numarr(oCookieVal) : [];

console.log(`  P cookie: ${pCookieBytes.length}B, O cookie: ${oCookieBytes.length}B`);

// 各种 SHA-384 候选（匹配 session_data 48B）
const sha384Candidates = [
  { name: 'SHA384(P_cookie_bytes)', data: Buffer.from(pCookieBytes) },
  { name: 'SHA384(O_cookie_bytes)', data: Buffer.from(oCookieBytes) },
  { name: 'SHA384(keys16)', data: Buffer.from(keys16) },
  { name: 'SHA384(keys17)', data: Buffer.from(keys17) },
  { name: 'SHA384(keys2)', data: Buffer.from(keys2) },
  { name: 'SHA384(keys16+keys17)', data: Buffer.from([...keys16, ...keys17]) },
  { name: 'SHA384(nsd)', data: Buffer.from(String(data.nsd)) },
  { name: 'SHA384(cd)', data: Buffer.from(data.cd) },
  { name: 'SHA384(P_cookie_str)', data: Buffer.from(data.cookie || '') },
  { name: 'SHA384(O_cookie_str)', data: Buffer.from(data.oCookie || '') },
];

for (const c of sha384Candidates) {
  const hash = crypto.createHash('sha384').update(c.data).digest();
  const match = Buffer.from(session0).equals(hash);
  if (match) {
    console.log(`  ★★★ ${c.name} == session_data ✅ MATCH!`);
  }
}
console.log('  SHA-384 直接匹配: 无');

// 各种 SHA-256 候选（匹配 request_data 32B）
const sha256Candidates = [
  { name: 'SHA256(URL)', data: Buffer.from(queries[0].path) },
  { name: 'SHA256(URL_upper)', data: Buffer.from(queries[0].path.toUpperCase()) },
  { name: 'SHA256(method+URL)', data: Buffer.from(queries[0].method + queries[0].path) },
  { name: 'SHA256(keys16)', data: Buffer.from(keys16) },
  { name: 'SHA256(keys17)', data: Buffer.from(keys17) },
  { name: 'SHA256(P_cookie)', data: Buffer.from(pCookieBytes) },
];

for (const c of sha256Candidates) {
  const hash = crypto.createHash('sha256').update(c.data).digest();
  const match = Buffer.from(request0).equals(hash);
  if (match) {
    console.log(`  ★★★ ${c.name} == request_data ✅ MATCH!`);
  }
}
console.log('  SHA-256 直接匹配: 无');

// ============ 假设 B：XXTEA 同会话 ============
console.log('\n--- 假设 B：XXTEA 同会话 keys ---');

// 收集 16 字节 key 候选（XXTEA 需要 4 个 uint32 = 16 字节）
const xxteaKeys = [];
for (const [k, v] of Object.entries(keys)) {
  if (v.length >= 16) {
    xxteaKeys.push({ name: `keys[${k}][0:16]`, bytes: v.slice(0, 16) });
  }
  if (v.length >= 32) {
    xxteaKeys.push({ name: `keys[${k}][16:32]`, bytes: v.slice(16, 32) });
  }
}
// 也加 MD5 派生
xxteaKeys.push({ name: 'MD5(P_cookie)', bytes: [...crypto.createHash('md5').update(Buffer.from(pCookieBytes)).digest()] });
xxteaKeys.push({ name: 'MD5(O_cookie)', bytes: [...crypto.createHash('md5').update(Buffer.from(oCookieBytes)).digest()] });
xxteaKeys.push({ name: 'MD5(keys16+keys17)', bytes: [...crypto.createHash('md5').update(Buffer.from([...keys16, ...keys17])).digest()] });
xxteaKeys.push({ name: 'MD5(cd)', bytes: [...crypto.createHash('md5').update(Buffer.from(data.cd)).digest()] });

for (const kc of xxteaKeys) {
  for (const endian of ['LE', 'BE']) {
    const keyU32 = endian === 'LE' ? bytesToUint32LE(kc.bytes) : bytesToUint32BE(kc.bytes);
    
    for (const [segName, seg] of [['session', session0], ['request', request0]]) {
      const dataU32 = endian === 'LE' ? bytesToUint32LE(seg) : bytesToUint32BE(seg);
      const decrypted = xxteaDecrypt([...dataU32], keyU32);
      const ptBytes = endian === 'LE' ? uint32ToBytesLE(decrypted) : uint32ToBytesBE(decrypted);
      
      const ascii = ptBytes.filter(b => b >= 32 && b < 127).length;
      const ratio = ascii / ptBytes.length * 100;
      
      if (ratio > 60) {
        const asciiStr = ptBytes.filter(b => b >= 32 && b < 127).map(b => String.fromCharCode(b)).join('');
        console.log(`  ★ XXTEA ${kc.name} ${endian} ${segName}: ASCII ${ratio.toFixed(0)}% [${ptBytes.slice(0,16).join(',')}] "${asciiStr.substring(0,30)}"`);
      }
    }
  }
}

// ============ 新假设 D：encryptMode1 但 key 经过变换 ============
console.log('\n--- 假设 D：key 变换后 AES ---');

// 也许 key = MD5(keys17) 或 key = keys16 XOR keys17
const derivedKeys = [
  { name: 'MD5(keys17)', key: [...crypto.createHash('md5').update(Buffer.from(keys17)).digest()] },
  { name: 'MD5(keys16)', key: [...crypto.createHash('md5').update(Buffer.from(keys16)).digest()] },
  { name: 'MD5(keys2[0:16])', key: [...crypto.createHash('md5').update(Buffer.from(keys2.slice(0, 16))).digest()] },
  { name: 'keys16^keys17', key: keys16.map((b, i) => b ^ keys17[i]) },
  { name: 'SHA1(keys17)[0:16]', key: [...crypto.createHash('sha1').update(Buffer.from(keys17)).digest().slice(0, 16)] },
  { name: 'SHA1(keys16)[0:16]', key: [...crypto.createHash('sha1').update(Buffer.from(keys16)).digest().slice(0, 16)] },
  { name: 'MD5(P_cookie)[0:16]', key: [...crypto.createHash('md5').update(Buffer.from(pCookieBytes)).digest()] },
  { name: 'MD5(O_cookie)[0:16]', key: [...crypto.createHash('md5').update(Buffer.from(oCookieBytes)).digest()] },
];

// 用 Node crypto 标准 AES 测试
for (const kc of derivedKeys) {
  for (const [segName, seg] of [['session', session0], ['request', request0]]) {
    for (const mode of ['cbc-zero', 'cbc-embedded', 'ecb']) {
      try {
        const keyBuf = Buffer.from(kc.key);
        let pt;
        if (mode === 'cbc-zero') {
          const d = crypto.createDecipheriv('aes-128-cbc', keyBuf, Buffer.alloc(16, 0));
          d.setAutoPadding(false);
          pt = [...Buffer.concat([d.update(Buffer.from(seg)), d.final()])];
        } else if (mode === 'cbc-embedded' && seg.length > 16) {
          const iv = Buffer.from(seg.slice(0, 16));
          const ct = Buffer.from(seg.slice(16));
          const d = crypto.createDecipheriv('aes-128-cbc', keyBuf, iv);
          d.setAutoPadding(false);
          pt = [...Buffer.concat([d.update(ct), d.final()])];
        } else if (mode === 'ecb') {
          const d = crypto.createDecipheriv('aes-128-ecb', keyBuf, null);
          d.setAutoPadding(false);
          pt = [...Buffer.concat([d.update(Buffer.from(seg)), d.final()])];
        }
        if (!pt) continue;
        
        const ascii = pt.filter(b => b >= 32 && b < 127).length;
        const ratio = ascii / pt.length * 100;
        if (ratio > 60) {
          console.log(`  ★ ${kc.name} ${segName} ${mode}: ASCII ${ratio.toFixed(0)}% [${pt.slice(0,16).join(',')}]`);
        }
      } catch(e) {}
    }
  }
}

// ============ 假设 E：session_data 包含加密的 cookie 信息 ============
console.log('\n--- 假设 E：session_data 结构分析 ---');

// 检查 session_data 是否有内部结构
console.log(`  session_data hex: ${session0.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
console.log(`  session_data 前 4B 作为 uint32 BE: 0x${((session0[0]<<24)|(session0[1]<<16)|(session0[2]<<8)|session0[3]).toString(16).padStart(8, '0')}`);
console.log(`  session_data 前 4B 作为 uint32 LE: 0x${((session0[3]<<24)|(session0[2]<<16)|(session0[1]<<8)|session0[0]).toString(16).padStart(8, '0')}`);

// 检查 3 个 16B block 之间的关系
const block0 = session0.slice(0, 16);
const block1 = session0.slice(16, 32);
const block2 = session0.slice(32, 48);
const xor01 = block0.map((b, i) => b ^ block1[i]);
const xor12 = block1.map((b, i) => b ^ block2[i]);
console.log(`  block0^block1: [${xor01.join(',')}]`);
console.log(`  block1^block2: [${xor12.join(',')}]`);
console.log(`  block0^block1 熵: ${entropy(xor01).toFixed(3)}`);

// ============ 假设 F：request_data 包含 URL 哈希 ============
console.log('\n--- 假设 F：request_data 与 URL 的关系 ---');

// 对每个 query，检查 request_data 是否与 URL 有数学关系
for (const q of queries) {
  const urlBytes = Buffer.from(q.path);
  const urlUpper = Buffer.from(q.path.toUpperCase());
  
  // CRC32(URL) 
  const urlCrc = crc32([...urlBytes]);
  const urlUpperCrc = crc32([...urlUpper]);
  
  // MD5(URL)
  const urlMd5 = crypto.createHash('md5').update(urlBytes).digest();
  const urlUpperMd5 = crypto.createHash('md5').update(urlUpper).digest();
  
  // 检查 request_data 的前 4 字节是否包含 CRC32(URL)
  const reqCrc = ((q.request[0]<<24)|(q.request[1]<<16)|(q.request[2]<<8)|q.request[3]) >>> 0;
  const reqCrcLE = ((q.request[3]<<24)|(q.request[2]<<16)|(q.request[1]<<8)|q.request[0]) >>> 0;
  
  console.log(`  Q[${q.idx}] ${q.method} ${q.path.substring(0, 40)}`);
  console.log(`    CRC32(URL)=0x${urlCrc.toString(16)} CRC32(URL_UPPER)=0x${urlUpperCrc.toString(16)}`);
  console.log(`    req[0:4] BE=0x${reqCrc.toString(16)} LE=0x${reqCrcLE.toString(16)}`);
  console.log(`    MD5(URL)=${urlMd5.toString('hex').substring(0, 16)}...`);
  console.log(`    req hex: ${q.request.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
}

// ============ 假设 G：request_data 包含时间戳 ============
console.log('\n--- 假设 G：时间戳检测 ---');
// 检查 request_data 中是否有 Unix 时间戳（~1785419660 = 2026-07-30）
const ts2026 = 1785419660; // 大约 2026-07-30
for (const q of queries.slice(0, 3)) {
  for (let off = 0; off <= q.request.length - 4; off++) {
    const valBE = ((q.request[off]<<24)|(q.request[off+1]<<16)|(q.request[off+2]<<8)|q.request[off+3]) >>> 0;
    const valLE = ((q.request[off+3]<<24)|(q.request[off+2]<<16)|(q.request[off+1]<<8)|q.request[off]) >>> 0;
    // 检查是否在 2026 年范围内 (±1天)
    if (Math.abs(valBE - ts2026) < 86400 || Math.abs(valLE - ts2026) < 86400) {
      console.log(`  ★ Q[${q.idx}] offset=${off}: BE=${valBE} LE=${valLE} (接近 2026 时间戳!)`);
    }
  }
}
console.log('  时间戳检测: 无匹配');

console.log('\n=== 完成 ===');
