/**
 * query_article_inspired.js — 文章思路启发的新解密尝试
 *
 * 从文章中获得的关键灵感：
 *
 * 1. 后缀（query）生成链路是 **从后往前** 推导：
 *    get_suffix(arr_final) → basestr 编码（与 cookie 相同的 numarr2string）
 *    arr_final = arr_4(nonce) + arr_549(data)
 *    arr_549 = _$b7(arr_35, arr_512)（拼接）
 *    arr_512 = _$kW(arr_498, arr_21)（拼接 + 某种变换）
 *    arr_498 = _$b7(arr_cookie, arr_259)（拼接）
 *    arr_259 = 后缀数据（含 URL、时间戳、校验等）
 *
 * 2. _$bo 函数是 **CRC32 校验**（与 cookie 的 uuid 校验相同）
 *
 * 3. _$kW 函数 = `_$$O(_$$a)` → `_$ei._$ee(_$mM, false)` 
 *    这是一个 **HMAC 或 加密操作**（_$ee 可能是 encrypt）
 *
 * 4. 关键：**后缀数据与 cookie 共享 basearr 管线**！
 *    - arr_21 和 cookie 的 arr_20_to_21 一致
 *    - arr_cookie 就是生成 cookie 的数组
 *
 * 5. _$b7 = numarrJoin（拼接两个数组）
 *
 * 新理解：
 * query 的 88 字节 = numarrJoin(nonce, 1, 0, session, request)
 * session_data 和 request_data 不是独立加密的
 * 而是通过类似 cookie 的管线生成：
 *   arr_259（请求数据）→ _$kW 变换 → arr_512 → arr_549 → arr_final → 编码
 *
 * 关键发现：_$kW 可能是 cookie 管线中的 encryptMode1/encryptMode2
 * _$ee 可能是自定义 AES 加密函数
 *
 * 验证：用管线管线处理 session_data 和 request_data
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
    bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  const rem = payload.length - i;
  if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem === 3) { bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4)); bytes.push(((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2)); }
  return bytes;
}

// 加载 query 数据
const queryData = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'output/capture-20080/query-browser-extracted.json'), 'utf8'
));
const queries = queryData.queries.filter(q => q.query).map(q => q.query);
const qBytes = decode(queries[0], BASESTR);

const sessionData = qBytes.slice(7, 55);
const requestData = qBytes.slice(56, 88);
const nonce = qBytes.slice(0, 4);

console.log('=== 文章思路启发的 query 分析 ===\n');
console.log('Query 88 bytes:', qBytes.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
console.log('session_data (48B):', sessionData.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
console.log('request_data (32B):', requestData.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));

// 关键发现：文章说 session_data 和 request_data 可能通过
// cookie 管线中的函数生成（不是标准 AES）
// cookie 的加密链路：
//   basearr(244) → huffman(217) → xor(keys2,16) → encryptMode1(keys17) → basearrEncrypt
//   → numarrJoin → encryptMode1(keys16) → cookie

// query 的 session_data 可能也经过类似链路
// 但密钥不是 keys16/17，而是 query 专用密钥

// 用管线的加密函数尝试
console.log('\n=== 用管线函数分析 ===');

// 先加载管线
const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
const { httpGet } = require('./proxy_http');

(async () => {
  const client = new PmosXjClientProxy();
  await client.init();
  
  const gv = require('@src/handler/globalVarible');
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  const numarrJoin = require('@src/handler/parser/common/numarrJoin');
  const combine4 = require('@src/handler/parser/common/combine4');
  
  console.log('管线函数已加载');

  // 关键：query 的 session_data 可能不是 AES 加密的
  // 而是经过 numarrEncrypt（Huffman）+ XOR + encryptMode1 的组合
  
  // 测试：对 session_data 做 numarrEncrypt 解码（Huffman 解码）
  console.log('\n=== Huffman 解码测试 ===');
  
  // numarrEncrypt 是 Huffman 编码（加密），不是解密
  // 我们需要 Huffman 解码（反向操作）
  // 但 numarrEncrypt 只有一个方向
  // Huffman 编码是无损的，可以逆向
  // 但我们的实现没有解码函数
  
  // 试试 numarrEncrypt 对 session_data 的输出长度
  const sEnc = numarrEncrypt([...sessionData]);
  console.log('numarrEncrypt(session): input=' + sessionData.length + ', output=' + sEnc.length);
  console.log('  output hex:', sEnc.slice(0, 40).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  const rEnc = numarrEncrypt([...requestData]);
  console.log('numarrEncrypt(request): input=' + requestData.length + ', output=' + rEnc.length);

  // 关键测试：session_data 和 request_data 的 XOR 差分
  console.log('\n=== 差分分析 ===');
  
  const queries2 = queries.slice(0, 3);
  const sessions = queries2.map(q => decode(q, BASESTR).slice(7, 55));
  const requests = queries2.map(q => decode(q, BASESTR).slice(56, 88));
  
  // session_data 在同会话内固定
  console.log('Session data 相同:', JSON.stringify(sessions[0]) === JSON.stringify(sessions[1]) && JSON.stringify(sessions[1]) === JSON.stringify(sessions[2]));
  
  // request_data 每请求变化
  console.log('Request data [0] vs [1] XOR:');
  const xor01 = requests[0].map((b, i) => b ^ requests[1][i]);
  const ascii01 = xor01.filter(b => b >= 32 && b <= 126).length / xor01.length;
  console.log('  ASCII:', (ascii01 * 100).toFixed(0) + '%');
  
  // 检查 request_data 是否包含 URL 信息
  // 请求的 URL 是 /px-gateway/GatewayConfig/getGatewayConfig
  // URL 的 ASCII 码: 2f 70 78 2d 67 61 74 65 77 61 79 2f 47 61 74 65 77 61 79 43 6f 6e 66 69 67 2f 67 65 74 47 61 74 65 77 61 79 43 6f 6e 66 69 67
  const urlBytes = '/px-gateway/GatewayConfig/getGatewayConfig'.split('').map(c => c.charCodeAt(0));
  console.log('\nURL bytes length:', urlBytes.length);
  console.log('URL hex:', urlBytes.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  // request_data (32B) 可能是 URL 的加密
  // 如果加密是可逆的，URL 应该出现在明文或中间态中
  // 尝试 XOR
  console.log('\nrequest XOR url (前 32 字节):');
  const rXorUrl = requestData.slice(0, Math.min(requestData.length, urlBytes.length)).map((b, i) => b ^ urlBytes[i]);
  const rXorAscii = rXorUrl.filter(b => b >= 32 && b <= 126).length / rXorUrl.length;
  console.log('  ASCII:', (rXorAscii * 100).toFixed(0) + '%');
  console.log('  hex:', rXorUrl.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  // 检查 request_data 是否包含方法名（POST）
  const methodBytes = 'POST'.split('').map(c => c.charCodeAt(0));
  console.log('\nrequest XOR POST:');
  const rXorMethod = requestData.slice(0, 4).map((b, i) => b ^ methodBytes[i]);
  console.log('  hex:', rXorMethod.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  // 检查 request_data 是否包含 body（{}）
  const bodyBytes = '{}'.split('').map(c => c.charCodeAt(0));
  console.log('\nrequest XOR body:');
  const rXorBody = requestData.slice(0, 2).map((b, i) => b ^ bodyBytes[i]);
  console.log('  hex:', rXorBody.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));

  // 关键：文章说 query 中的 arr_21 和 cookie 的 arr_20_to_21 一致
  // arr_21 是 cookie 管线中的 21 字节数组（keys17 相关）
  // 检查 query 的 session_data 是否包含 keys17 的加密结果
  
  console.log('\n=== 检查 keys 相关性 ===');
  console.log('keys16:', gv.keys[16].slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('keys17:', gv.keys[17].slice(0, 21).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  // 尝试用 keys16/keys17 解密 session_data（用 encryptMode2）
  console.log('\n=== encryptMode2 with keys16/17 ===');
  
  [0, 1].forEach(flag => {
    try {
      const dec = encryptMode2([...sessionData], gv.keys[16].slice(0, 16), flag);
      if (dec && dec.length > 0) {
        const ascii = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
        console.log(`keys16 session f=${flag}: ${dec.length}B, ${(ascii*100).toFixed(0)}% ASCII`);
        if (ascii > 0.5) {
          console.log('  str:', Buffer.from(dec.map(b=>b&0xFF)).toString('utf8').substring(0, 48));
        }
      }
    } catch(e) {}
  });
  
  [0, 1].forEach(flag => {
    try {
      const dec = encryptMode2([...sessionData], gv.keys[17].slice(0, 16), flag);
      if (dec && dec.length > 0) {
        const ascii = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
        console.log(`keys17 session f=${flag}: ${dec.length}B, ${(ascii*100).toFixed(0)}% ASCII`);
        if (ascii > 0.5) {
          console.log('  str:', Buffer.from(dec.map(b=>b&0xFF)).toString('utf8').substring(0, 48));
        }
      }
    } catch(e) {}
  });

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
