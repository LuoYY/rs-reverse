/**
 * 13_cookie_query_link.js
 * 
 * 验证两个关键假设：
 * 1. P cookie 是否一次性使用（每次请求重新生成）
 * 2. query 参数是否与 cookie + body 有关（hash/MD5）
 * 
 * 方法：解码 curl 样例中的 cookie 和 query，分析字节级关系
 */

const crypto = require('crypto');
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

function crc32(arr) {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  let v = -1;
  for (let i = 0; i < arr.length; i++) v = (v >>> 8) ^ t[(v ^ arr[i]) & 255];
  return (v ^ -1) >>> 0;
}

// ============ curl 样例数据 ============
const oCookie = '60jsZMjbyTuqZmqwE8.MNOVF3F5Jpxi9m07prvQjkRK1cM9QWT1VNJYwwYP.RVnCn9hOGRbDj5_jquIhuYBOa2EG';
const pCookie = '0K70fXVy6MTIUuP2OhF9d6hE34MJ2Wtmzi7Z7jaoWwqcmUVOgox0tL.CPZTF13HGeTX4N1JJ8.d_cxECPtU.59fwTKmUSYV2aEHck7mNshPHjckQQ8.oWhE7wcbVr7neotBrchFq72.ovrFkCY9BRU4rXg.NrtYgC3izPM4ka7GG4wv5vNsUWyD1qB3obDEKMOsuQpfNw8byF8c4wvCHVnSL37Y1UkAliHBhByvjXs5POJ_nminKWHAmIviVzD.rifxvGYVShncvplwYW9LYRsyrSDZo4DhRHMDRX7c1yWqdywWX6fIPrZ9pggecGrx9icdy3Y.tatzyamIXm8mkIHWkVmAD9zmdfHO9h3rDo.jjKTwmo5bpLt9gBF.7L9J6rJy_6guzDPgG41rZ7BDZp3hsavK.pHTVS10pA7gpU83YFEroptdJ70TntKONhALZg';
const queryVal = '0cH2z6alqWiHiNwTDTT9ABh2FX7GJD.NfBm2SuajORE95nPDCafZ9eGKjFSigcTDA3gO0R8UCyPqWYfepRiGdjUYIG4KvLol4tcrO.g7P6Ic5ZfI7eyIXVA';
const body = '{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}';
const url = '/px-common-authority/marketMapping/selectByCondition';

console.log('=== Cookie-Query 关联分析 ===\n');

// [1] 解码所有数据
console.log('--- 1. 解码 ---');
const oBytes = string2numarr(oCookie);
const pBytes = string2numarr(pCookie.substring(1)); // 去掉 '0' 前缀
const qBytes = string2numarr(queryVal.substring(1)); // 去掉 '0' 前缀

console.log(`  O cookie: ${oCookie.length} chars → ${oBytes.length} bytes`);
console.log(`  P cookie: ${pCookie.length} chars → ${pBytes.length} bytes`);
console.log(`  Query: ${queryVal.length} chars → ${qBytes.length} bytes`);

// [2] 验证 query CRC32
console.log('\n--- 2. Query CRC32 验证 ---');
if (qBytes.length === 88) {
  const storedCrc = ((qBytes[0]<<24)|(qBytes[1]<<16)|(qBytes[2]<<8)|qBytes[3]) >>> 0;
  const computedCrc = crc32(qBytes.slice(4));
  console.log(`  stored:   0x${storedCrc.toString(16).padStart(8,'0')}`);
  console.log(`  computed: 0x${computedCrc.toString(16).padStart(8,'0')}`);
  console.log(`  ${storedCrc === computedCrc ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`  结构: [${qBytes.slice(0,4).join(',')}] [${qBytes[4]}] [${qBytes[5]}] [${qBytes[6]}] [session ${qBytes.slice(7,55).length}B] [${qBytes[55]}] [request ${qBytes.slice(56,88).length}B]`);
}

// [3] P cookie 结构分析
console.log('\n--- 3. P cookie 结构 ---');
console.log(`  P cookie 前 20B: [${pBytes.slice(0, 20).join(',')}]`);
console.log(`  P cookie 长度: ${pBytes.length}B`);

// P cookie 外层用 keys16 flag=1 加密，前 16B 是 IV
// 但我们没有这个会话的 keys16，所以不能解密
// 但可以检查结构

// [4] Query 与 Cookie 的字节级关系
console.log('\n--- 4. 字节级关系搜索 ---');

const sessionData = qBytes.slice(7, 55);  // 48B
const requestData = qBytes.slice(56, 88); // 32B

// 搜索 query 中是否包含 cookie 的字节片段
for (let patLen = 4; patLen <= 8; patLen++) {
  for (let i = 0; i <= pBytes.length - patLen; i++) {
    const pattern = pBytes.slice(i, i + patLen);
    const patStr = pattern.join(',');
    
    // 在 session_data 中搜索
    for (let j = 0; j <= sessionData.length - patLen; j++) {
      if (sessionData.slice(j, j + patLen).join(',') === patStr) {
        console.log(`  ★ P_cookie[${i}..${i+patLen-1}] == session[${j}..${j+patLen-1}]: [${patStr}]`);
      }
    }
    // 在 request_data 中搜索
    for (let j = 0; j <= requestData.length - patLen; j++) {
      if (requestData.slice(j, j + patLen).join(',') === patStr) {
        console.log(`  ★ P_cookie[${i}..${i+patLen-1}] == request[${j}..${j+patLen-1}]: [${patStr}]`);
      }
    }
  }
}
console.log('  字节片段搜索完成（4-8 字节模式）');

// [5] MD5/SHA 假设测试
console.log('\n--- 5. MD5/SHA 假设 ---');

// 假设：request_data = MD5(body) 或 SHA256(body)
const bodyMd5 = crypto.createHash('md5').update(body).digest();
const bodySha256 = crypto.createHash('sha256').update(body).digest();
const bodySha1 = crypto.createHash('sha1').update(body).digest();

console.log(`  MD5(body):    ${bodyMd5.toString('hex')}`);
console.log(`  SHA256(body): ${bodySha256.toString('hex')}`);
console.log(`  request_data: ${Buffer.from(requestData).toString('hex')}`);
console.log(`  MD5(body) == request_data? ${Buffer.from(requestData).equals(bodyMd5) ? '✅ YES!' : '❌ No'}`);
console.log(`  SHA256(body) == request_data? ${Buffer.from(requestData).equals(bodySha256) ? '✅ YES!' : '❌ No'}`);

// 假设：request_data = MD5(url + body)
const urlBodyMd5 = crypto.createHash('md5').update(url + body).digest();
console.log(`  MD5(url+body) == request_data? ${Buffer.from(requestData).equals(urlBodyMd5) ? '✅ YES!' : '❌ No'}`);

// 假设：request_data = MD5(cookie + body)
const cookieStr = `aoU85Lxl9xxNO=${oCookie}; aoU85Lxl9xxNP=${pCookie}`;
const cookieBodyMd5 = crypto.createHash('md5').update(cookieStr + body).digest();
console.log(`  MD5(cookie+body) == request_data? ${Buffer.from(requestData).equals(cookieBodyMd5) ? '✅ YES!' : '❌ No'}`);

// 假设：session_data = SHA384(cookie)
const cookieSha384 = crypto.createHash('sha384').update(cookieStr).digest();
console.log(`  SHA384(cookie) == session_data? ${Buffer.from(sessionData).equals(cookieSha384) ? '✅ YES!' : '❌ No'}`);

// 假设：session_data = MD5(P_cookie_bytes)
const pMd5 = crypto.createHash('md5').update(Buffer.from(pBytes)).digest();
console.log(`  MD5(P_bytes) == request_data? ${Buffer.from(requestData).equals(pMd5) ? '✅ YES!' : '❌ No'}`);

// 更多组合
const combos = [
  { name: 'MD5(url)', data: url },
  { name: 'MD5(url.toUpperCase())', data: url.toUpperCase() },
  { name: 'MD5(body+url)', data: body + url },
  { name: 'MD5(P_cookie_str)', data: pCookie },
  { name: 'MD5(O_cookie_str)', data: oCookie },
  { name: 'SHA256(url)', data: url },
  { name: 'SHA256(url.toUpperCase())', data: url.toUpperCase() },
  { name: 'MD5(url+body+cookie)', data: url + body + cookieStr },
];

for (const c of combos) {
  const md5 = crypto.createHash('md5').update(c.data).digest();
  const sha256 = crypto.createHash('sha256').update(c.data).digest();
  if (Buffer.from(requestData).equals(md5)) console.log(`  ★★★ ${c.name} == request_data! ✅`);
  if (Buffer.from(requestData).equals(sha256)) console.log(`  ★★★ SHA256(${c.name}) == request_data! ✅`);
  if (Buffer.from(sessionData).equals(sha256)) console.log(`  ★★★ SHA256(${c.name}) == session_data! ✅`);
}

// [6] 之前的同会话数据验证
console.log('\n--- 6. 同会话 query 差分（之前的数据）---');
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/capture-20080/query-diff-data.json'), 'utf8'));

// 解码所有 query
const queries = data.queries.map((q, i) => {
  const bytes = string2numarr(q.query.substring(1));
  return { idx: i, method: q.method, path: q.path, bytes, request: bytes.slice(56, 88) };
});

// 检查同 URL 的 query（Query 1 和 2 都是 GET /px-gateway/GatewayConfig/security）
const q1 = queries[1]; // GET security
const q2 = queries[2]; // GET security (same URL!)

console.log(`  Q[1]: ${q1.method} ${q1.path}`);
console.log(`  Q[2]: ${q2.method} ${q2.path}`);
console.log(`  同 URL 同方法，request_data 是否相同? ${Buffer.from(q1.request).equals(Buffer.from(q2.request)) ? '✅ YES' : '❌ NO (不同)'}`);
console.log(`  Q[1] request: ${Buffer.from(q1.request).toString('hex')}`);
console.log(`  Q[2] request: ${Buffer.from(q2.request).toString('hex')}`);

// 如果同 URL 同方法但 request_data 不同，说明 request_data 包含时间戳或随机数
// 这意味着 query 不是纯 hash(body + cookie)，还包含时间因素

// [7] P cookie 是否每次请求变化
console.log('\n--- 7. Cookie 一次性使用分析 ---');
console.log('  从之前的测试记录：');
console.log('  - cookie 绑定测试（5轮×7方式）：同 cookie 90s 内 9 次重放全 200');
console.log('  - 结论：cookie 不是一次性的，可以重放');
console.log('  - 但浏览器可能主动轮换 cookie（RS 内部逻辑）');
console.log('');
console.log('  用户观察：浏览器每次请求都重新生成 P cookie');
console.log('  可能原因：');
console.log('  1. RS 主动轮换（安全策略），但旧 cookie 仍然有效');
console.log('  2. 服务端要求每次请求使用新 cookie（需要验证）');
console.log('  3. RS 在每次 XHR send 时重新生成 cookie + query');

// [8] 关键测试：query 的 session_data 是否与 cookie 相关
console.log('\n--- 8. session_data 与 cookie 的关系 ---');
// 如果 session_data 在同会话内固定，而 cookie 也在同会话内固定
// 那么 session_data 可能是 cookie 的某种派生

// 检查 session_data 是否包含在 P cookie 中
const sessHex = Buffer.from(sessionData).toString('hex');
const pHex = Buffer.from(pBytes).toString('hex');
console.log(`  session_data hex: ${sessHex}`);
console.log(`  session_data 在 P cookie 中? ${pHex.includes(sessHex) ? '✅ YES!' : '❌ No'}`);
console.log(`  session_data 前 8B 在 P cookie 中? ${pHex.includes(sessHex.substring(0, 16)) ? '✅ YES!' : '❌ No'}`);

console.log('\n=== 完成 ===');
