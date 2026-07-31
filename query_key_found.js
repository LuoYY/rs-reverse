/**
 * query_key_found.js — 验证找到的密钥 + 尝试生成 query
 *
 * ★★★ 找到 query 加密密钥！ ★★★
 * 密钥 = "1:pmos.xj.sgcc.c"（16 字节 ASCII）
 * = 域名的一部分
 *
 * 验证：
 * 1. 用这个密钥解密 session_data → 应该得到有意义的明文
 * 2. 用这个密钥解密 request_data → 应该包含 URL 信息
 * 3. 理解明文结构
 * 4. 尝试生成新的 query
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');

const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeQuery(query) {
  var payload = query.startsWith('0') ? query.slice(1) : query;
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  var bytes = [], i = 0;
  var full = Math.floor(payload.length / 4);
  for (var g = 0; g < full; g++) {
    var c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
    i += 4;
    bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  return bytes;
}

function encodeQuery(bytes) {
  var result = [];
  var i = 0;
  var full = Math.floor(bytes.length / 3);
  for (var g = 0; g < full; g++) {
    var c0 = bytes[i], c1 = bytes[i+1], c2 = bytes[i+2]; i += 3;
    result.push(BASESTR[c0 >> 2], BASESTR[((c0 & 3) << 4) | (c1 >> 4)], BASESTR[((c1 & 15) << 2) | (c2 >> 6)], BASESTR[c2 & 63]);
  }
  var rem = bytes.length - i;
  if (rem === 1) { var c0 = bytes[i]; result.push(BASESTR[c0 >> 2], BASESTR[(c0 & 3) << 4]); }
  else if (rem === 2) { var c0 = bytes[i], c1 = bytes[i+1]; result.push(BASESTR[c0 >> 2], BASESTR[((c0 & 3) << 4) | (c1 >> 4)], BASESTR[(c1 & 15) << 2]); }
  return '0' + result.join('');
}

(async () => {
  console.log('=== 验证 query 加密密钥 ===\n');

  // 密钥
  var keyStr = "1:pmos.xj.sgcc.c";
  var key = [];
  for (var i = 0; i < keyStr.length; i++) key.push(keyStr.charCodeAt(i));
  console.log('Key:', keyStr);
  console.log('Key hex:', key.map(function(b) { return b.toString(16).padStart(2,'0'); }).join(' '));

  // 初始化管线
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(+m[1], m[2]);
  await client._genCookie({ nsd: +m[1], cd: m[2], from: 'https://pmos.xj.sgcc.com.cn:20080/', hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  var numarrJoin = require('@src/handler/parser/common/numarrJoin');
  var numarr2string = require('@src/handler/parser/common/numarr2string');
  var uuid = require('@src/handler/parser/common/uuid');
  
  // 加载浏览器捕获的 query
  var queryData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/key-extract-v2.json'), 'utf8'));
  var queryValue = queryData.query;
  var qBytes = decodeQuery(queryValue);
  
  console.log('\nQuery bytes (88):', qBytes.length);
  console.log('Query hex:', qBytes.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  
  var nonce = qBytes.slice(0, 4);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  // 解密 session_data
  console.log('\n=== 解密 session_data ===');
  [0, 1].forEach(function(flag) {
    try {
      var dec = encryptMode2([...sessionData], key, flag);
      if (dec && dec.length > 0) {
        var ascii = dec.filter(function(b) { return b >= 32 && b <= 126; }).length / dec.length;
        console.log('flag=' + flag + ': ' + dec.length + 'B, ' + (ascii*100).toFixed(0) + '% ASCII');
        console.log('  hex:', dec.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
        console.log('  str:', Buffer.from(dec.map(function(b) { return b & 0xFF; })).toString('utf8'));
      }
    } catch(e) { console.log('flag=' + flag + ': ERROR ' + e.message.substring(0,60)); }
  });
  
  // 解密 request_data
  console.log('\n=== 解密 request_data ===');
  [0, 1].forEach(function(flag) {
    try {
      var dec = encryptMode2([...requestData], key, flag);
      if (dec && dec.length > 0) {
        var ascii = dec.filter(function(b) { return b >= 32 && b <= 126; }).length / dec.length;
        console.log('flag=' + flag + ': ' + dec.length + 'B, ' + (ascii*100).toFixed(0) + '% ASCII');
        console.log('  hex:', dec.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
        console.log('  str:', Buffer.from(dec.map(function(b) { return b & 0xFF; })).toString('utf8'));
      }
    } catch(e) { console.log('flag=' + flag + ': ERROR ' + e.message.substring(0,60)); }
  });
  
  // 如果解密成功，尝试生成新 query
  console.log('\n=== 尝试生成新 query ===');
  
  // 生成新的 nonce
  var crypto = require('crypto');
  var newNonce = Buffer.alloc(4);
  require('crypto').randomFillSync(newNonce);
  newNonce = [...newNonce];
  console.log('New nonce:', newNonce.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  
  // 用 encryptMode1 加密 session_data（用解密后的明文重新加密）
  // 但我们需要先理解明文结构
  
  // 尝试：用 encryptMode1 加密一个测试数据
  var testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  var encrypted = encryptMode1([...testData], key, 0);
  console.log('encryptMode1 test:', encrypted.length, 'bytes');
  console.log('  hex:', encrypted.slice(0, 20).map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  
  // 验证：encryptMode1 → encryptMode2 往返
  var decrypted = encryptMode2([...encrypted], key, 0);
  console.log('decrypt back:', decrypted.length, 'bytes');
  console.log('  match:', JSON.stringify(decrypted) === JSON.stringify(testData) ? 'YES ✅' : 'NO ❌');
  
  // 如果密钥正确，尝试生成完整 query
  // query = '0' + numarr2string(numarrJoin(nonce, 1, 0, session_encrypted, request_encrypted))
  
  console.log('\n=== 生成完整 query ===');
  
  // 用 session_data 的明文重新加密
  // 首先解密 session_data
  var sessionPlain = encryptMode2([...sessionData], key, 0);
  if (sessionPlain && sessionPlain.length > 0) {
    console.log('Session plain:', sessionPlain.length, 'bytes');
    console.log('  hex:', sessionPlain.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
    
    // 重新加密
    var sessionReEncrypted = encryptMode1([...sessionPlain], key, 0);
    console.log('Session re-encrypted:', sessionReEncrypted.length, 'bytes');
    
    // 检查是否与原始匹配
    var sessionMatch = JSON.stringify(sessionReEncrypted) === JSON.stringify(sessionData);
    console.log('Session match:', sessionMatch ? 'YES ✅' : 'NO ❌');
    
    if (sessionMatch) {
      console.log('\n★★★ 密钥验证成功！可以生成 query！ ★★★');
      
      // 生成新的 request_data（用 URL 信息）
      // 从文章：request_data 包含 URL + 时间戳 + 校验
      // 这里先用原始 request_data
      var requestPlain = encryptMode2([...requestData], key, 0);
      if (requestPlain && requestPlain.length > 0) {
        console.log('\nRequest plain:', requestPlain.length, 'bytes');
        console.log('  hex:', requestPlain.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
        console.log('  str:', Buffer.from(requestPlain.map(function(b) { return b & 0xFF; })).toString('utf8'));
      }
      
      // 组装 query
      var queryBytes = numarrJoin(
        newNonce[0], newNonce[1], newNonce[2], newNonce[3],
        1, 0,
        sessionReEncrypted,
        encryptMode1([...requestPlain], key, 0)
      );
      
      var queryStr = encodeQuery(queryBytes);
      console.log('\nGenerated query:', queryStr.substring(0, 60) + '...');
      console.log('Length:', queryStr.length);
    }
  }
  
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
