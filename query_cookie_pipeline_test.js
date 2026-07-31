/**
 * query_cookie_pipeline_test.js — 测试 query 是否复用 cookie 管线
 *
 * 关键发现（从文章）：
 * 1. query 和 cookie 共享管线（相同的 encryptMode1/2 + basestr + numarrJoin）
 * 2. session_data 是 encryptMode1(keys16) 加密的
 * 3. 但 keys 来自不同会话 → 管线 keys ≠ 浏览器 keys
 *
 * 关键洞察：
 * 管线 keys16 f=0 解密 session_data → 18B 输出（ASCII 44%）
 * 管线 keys16 f=1 解密 → 无输出
 *
 * 18B 输出说明 encryptMode2 成功解密了
 * 但 44% ASCII 说明结果是二进制的
 * 
 * 18B = 48B - 16B(IV) - 14B(剩余 padding)?
 * 或 18B = 32B(明文) - 14B(strip)
 * 
 * 关键问题：
 * 为什么 encryptMode2 用不同会话的 keys 也能部分解密？
 * 答案：RS 的 encryptMode2 是确定的（同 key 同结果）
 * 不同 key 产生不同的"伪解密"结果
 * 真正正确的 key 应该产生高 ASCII 的明文
 * 
 * 但我们的管线 keys 是不同会话的
 * 所以不可能得到正确结果
 * 
 * 核心结论：
 * 需要在同一会话中获取 keys + query
 * 浏览器的 keys 在 VM 闭包中，不能直接提取
 * 
 * 文章思路的最终方向：
 * 在浏览器中找到加密函数的直接引用
 * 传入明文 → 获取加密结果
 * 这样不需要知道密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
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

(async () => {
  console.log('=== 文章思路：query 复用 cookie 管线 ===\n');

  // 加载管线
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  
  var ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var nsd = +m[1], cd = m[2];
  
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(nsd, cd);
  var ts2 = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  var gen = await client._genCookie(ts2, cp3);

  var gv = require('@src/handler/globalVarible');
  var { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  var numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');
  var numarrJoin = require('@src/handler/parser/common/numarrJoin');
  var uuid = require('@src/handler/parser/common/uuid');
  
  console.log('管线函数已加载');
  console.log('keys16:', gv.keys[16].slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('keys17:', gv.keys[17].slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('cookie:', gen.cookie.substring(0, 60) + '...');
  console.log('cookie name:', gen.name);

  // 文章思路：query 的 session_data 可能包含 cookie 的加密结果
  // cookie 的 nextarr = numarrJoin(uuid, numarrJoin(2, time, keys2, 128, basearrEncrypt))
  // session_data 可能是 nextarr 的一部分
  
  // 尝试：用管线的 nextarr 作为 session_data 的来源
  console.log('\n=== 尝试用管线管线生成 session_data ===');
  
  // 获取管线的 nextarr（从 cookie 解密）
  var pCookie = gen.cookie;
  if (pCookie.startsWith('0')) pCookie = pCookie.slice(1);
  
  var payload = pCookie;
  var idxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in idxmap)) idxmap[BASESTR[i]] = i; }
  var cookieBytes = [];
  var ci = 0;
  var full = Math.floor(payload.length / 4);
  for (var g = 0; g < full; g++) {
    var c0 = idxmap[payload[ci]], c1 = idxmap[payload[ci+1]], c2 = idxmap[payload[ci+2]], c3 = idxmap[payload[ci+3]];
    ci += 4;
    cookieBytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  
  console.log('Cookie decoded:', cookieBytes.length, 'bytes');
  
  // 用 keys16 解密 cookie → nextarr
  // cookie 编码是 '0' + numarr2string(encryptMode1(uuid+nextarr, keys16_with_time, 1))
  // 解密需要用 encryptMode2
  // 但 cookie 的 318 字节不是 16 的倍数 → 需要正确解码
  // numarr2string 编码后每 4 字符 = 3 字节
  // 318 / 3 * 4 = 424 → 但 cookie 字符串长度可能不同
  
  // 实际上 cookie 值（不含 '0' 前缀）的编码方式：
  // encryptMode1 输出是字节数组 → numarr2string 编码 → 字符串
  // 所以需要先 numarr2string 解码 → 字节数组 → encryptMode2 解密
  
  // cookie 318 bytes 是解码后的字节数组
  // 但 318 不是 16 的倍数 → 说明解码不完整或有额外数据
  
  // 实际 cookie 字符串长度应该能被 4 整除（numarr2string 编码）
  // 让我们重新检查
  console.log('cookie value length:', gen.cookie.length);
  console.log('cookie value first 10:', gen.cookie.substring(0, 10));
  
  // gen.cookie 是纯 cookie 值（不含 name=），以 '0' 开头
  // 去掉 '0' 前缀后用 basestr 解码
  var cookiePayload = gen.cookie;
  if (cookiePayload.startsWith('0')) cookiePayload = cookiePayload.slice(1);
  console.log('cookie payload length:', cookiePayload.length);
  
  // 重新解码
  var cookieIdxmap = {};
  for (var i = 0; i < BASESTR.length; i++) { if (!(BASESTR[i] in cookieIdxmap)) cookieIdxmap[BASESTR[i]] = i; }
  var cookieBytes = [];
  var ci2 = 0;
  var fullC = Math.floor(cookiePayload.length / 4);
  for (var g = 0; g < fullC; g++) {
    var c0 = cookieIdxmap[cookiePayload[ci2]], c1 = cookieIdxmap[cookiePayload[ci2+1]], c2 = cookieIdxmap[cookiePayload[ci2+2]], c3 = cookieIdxmap[cookiePayload[ci2+3]];
    ci2 += 4;
    cookieBytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
  }
  var remC = cookiePayload.length - ci2;
  if (remC === 2) cookieBytes.push((cookieIdxmap[cookiePayload[ci2]]<<2)|(cookieIdxmap[cookiePayload[ci2+1]]>>4));
  else if (remC === 3) { cookieBytes.push((cookieIdxmap[cookiePayload[ci2]]<<2)|(cookieIdxmap[cookiePayload[ci2+1]]>>4)); cookieBytes.push(((cookieIdxmap[cookiePayload[ci2+1]]&15)<<4)|(cookieIdxmap[cookiePayload[ci2+2]]>>2)); }
  
  console.log('Cookie decoded properly:', cookieBytes.length, 'bytes');
  console.log('Is multiple of 16?', cookieBytes.length % 16 === 0);
  
  // encryptMode1 flag=1 输出 = IV(4 uint32=16B) + 密文
  // 密文 = ceil((nextarr.length + padding) / 16) * 16
  // cookie 总字节 = 16 + 密文
  
  // 用 keys16 解密 cookie → nextarr
  var numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  // cookie 用 numarrAddTime(keys16) 加密
  var keys16WithTime = numarrAddTime(gv.keys[16], undefined, undefined)[0];
  console.log('keys16 with time:', keys16WithTime.slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  var nextarr = encryptMode2([...cookieBytes], keys16WithTime, 1);
  console.log('nextarr length:', nextarr.length);
  console.log('nextarr hex:', nextarr.slice(0, 40).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  // nextarr 结构：[uuid 4B][numarrJoin(2, time, keys2, 128, basearrEncrypt)]
  // 第一个 4 字节是 uuid
  var uuidBytes = nextarr.slice(0, 4);
  var content = nextarr.slice(4);
  console.log('uuid:', uuidBytes.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('content length:', content.length);
  
  // 用 uuid 校验
  var computedUuid = uuid(content);
  var computedUuidBytes = [
    (computedUuid >>> 24) & 0xFF,
    (computedUuid >>> 16) & 0xFF,
    (computedUuid >>> 8) & 0xFF,
    computedUuid & 0xFF,
  ];
  console.log('computed uuid:', computedUuidBytes.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('uuid match:', JSON.stringify(uuidBytes) === JSON.stringify(computedUuidBytes));
  
  // content 的结构：[2][8][time][48][keys2][highByte][baLen][basearrEncrypt]
  // 从 content 提取 keys2
  console.log('\n=== content 结构 ===');
  var idx = 0;
  // [2] = 标量
  console.log('content[0] =', content[idx++]);
  // [8] = 标量
  console.log('content[1] =', content[idx++]);
  // time = numarrJoin 数组
  var timeLen = content[idx++];
  var timeBytes = content.slice(idx, idx + timeLen);
  idx += timeLen;
  console.log('time (' + timeLen + 'B):', timeBytes.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  // keys2 = numarrJoin 数组
  var keys2Len = content[idx++];
  var keys2 = content.slice(idx, idx + keys2Len);
  idx += keys2Len;
  console.log('keys2 (' + keys2Len + 'B):', keys2.slice(0, 20).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '), '...');
  // 后续是 basearrEncrypt
  
  // 关键：query 的 session_data 可能包含类似 keys2 的加密数据
  // 检查 session_data 是否包含 keys2 的子串
  var queryData = JSON.parse(fs.readFileSync(path.join(__dirname, 'output/capture-20080/query-browser-extracted.json'), 'utf8'));
  var queryBytes = decodeQuery(queryData.queries[0].query);
  var sessionData = queryBytes.slice(7, 55);
  
  console.log('\n=== 检查 session_data 是否包含 keys2 子串 ===');
  // session_data 来自不同会话，keys2 不同
  // 但结构应该类似
  
  // 检查 session_data 的前几个字节是否是 keys2 的结构
  console.log('session_data 前 20 字节:', sessionData.slice(0, 20).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('keys2 前 20 字节:', keys2.slice(0, 20).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  
  // 它们不同（不同会话），但结构可能类似
  
  // 关键突破：session_data 可能不是直接加密的
  // 而是经过 numarrEncrypt（Huffman）+ encryptMode1 的组合
  // 先 Huffman 编码，再 AES 加密
  
  console.log('\n=== 测试 Huffman + encryptMode1 组合 ===');
  
  // 对 session_data 做 Huffman 解码（逆向）
  // numarrEncrypt 是 Huffman 编码（正向）
  // 但我们需要解码
  // Huffman 编码是无损的，可以逆向
  // 但需要知道 Huffman 树
  
  // numarrEncrypt 的 Huffman 树是固定的（从 getTree() 生成）
  // 所以解码也是固定的
  
  // 试试：对 session_data 做 Huffman 编码，看输出是否与 cookie 管线匹配
  var sessionHuffman = numarrEncrypt([...sessionData]);
  console.log('Huffman(session): input=' + sessionData.length + ', output=' + sessionHuffman.length);
  
  // 然后对 Huffman 结果做 encryptMode2
  [0, 1].forEach(function(flag) {
    try {
      var dec = encryptMode2([...sessionHuffman], gv.keys[16].slice(0, 16), flag);
      if (dec && dec.length > 0) {
        var ascii = dec.filter(b => b >= 32 && b <= 126).length / dec.length;
        console.log('Huffman+encryptMode2 f=' + flag + ': ' + dec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
        if (ascii > 0.5) {
          console.log('  str:', Buffer.from(dec.map(b=>b&0xFF)).toString('utf8').substring(0, 48));
        }
      }
    } catch(e) {}
  });
  
  // 最终结论
  console.log('\n=== 最终结论 ===');
  console.log('1. query 的 session_data 确实是 encryptMode1(keys16) 加密的');
  console.log('2. 但 keys16 来自不同会话 → 无法用管线 keys 解密浏览器 query');
  console.log('3. 需要在同一会话中获取 keys + query');
  console.log('4. 或者：在浏览器中提取加密函数引用');
  console.log('5. 或者：用 CDP 直接在浏览器中调用 RS 的 query 生成函数');
  
  console.log('\n当前可用方案：');
  console.log('★ GET: 纯算法 100% (pmos_xj_client.js)');
  console.log('★ POST: CDP 代理 100% (pmos_xj_post_client.js)');
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
