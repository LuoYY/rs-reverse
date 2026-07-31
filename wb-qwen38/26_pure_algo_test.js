/**
 * 26_pure_algo_test.js
 * 
 * 纯算法 POST 测试：
 * 1. 从 412 页面获取 nsd/cd → 解密得到 keys
 * 2. 用管线生成 cookie
 * 3. 构造 query（用随机 bytes[0-12] 和 byte[17]）
 * 4. 发送 POST 请求验证
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

// 初始化管线
require('module-alias')(path.join(__dirname, '..'));
const gv = require('@src/handler/globalVarible');
const constData = require('@src/handler/parser/constData');
constData.init();
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarrJoin = require('@src/handler/parser/common/numarrJoin');
const numarr2string = require('@src/handler/parser/common/numarr2string');
const uuid = require('@src/handler/parser/common/uuid');

const TARGET_HOST = 'pmos.xj.sgcc.com.cn';
const TARGET_PORT = 20080;

function crc32(arr) {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
  let v = -1;
  for (let i = 0; i < arr.length; i++) v = (v >>> 8) ^ t[(v ^ arr[i]) & 255];
  return (v ^ -1) >>> 0;
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== 纯算法 POST 测试 ===\n');
  
  // [1] 获取 412 页面
  console.log('[1] 获取 412 页面...');
  const res412 = await httpsRequest({
    hostname: TARGET_HOST, port: TARGET_PORT, path: '/',
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    rejectUnauthorized: false,
  });
  console.log(`  状态: ${res412.status}`);
  
  // 提取 $_ts（与 pmos_xj_client.js 相同的正则）
  const tsMatch = res412.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  
  if (!tsMatch) {
    console.log('  ❌ 无法提取 nsd/cd, status=' + res412.status);
    console.log('  body 前 200:', res412.body.substring(0, 200));
    return;
  }
  
  const nsd = parseInt(tsMatch[1]);
  const cd = tsMatch[2];
  console.log(`  nsd: ${nsd}`);
  console.log(`  cd: ${cd.substring(0, 40)}...`);
  
  // 提取 O cookie
  const setCookies = res412.headers['set-cookie'] || [];
  let oCookie = '';
  for (const sc of setCookies) {
    const m = sc.match(/aoU85Lxl9xxNO=([^;]+)/);
    if (m) oCookie = m[1];
  }
  console.log(`  O cookie: ${oCookie.substring(0, 30)}...`);
  
  // [2] 用管线解密 cd → 获取 keys
  console.log('\n[2] 解密 cd...');
  
  // 使用管线的 Coder + tscd 解密
  const Coder = require('@src/handler/Coder');
  const config = require('@src/config/');
  
  // 提取外层 JS 代码
  const jsMatch = res412.body.match(/src="([^"]+\.js)"/);
  let jsCode = '';
  if (jsMatch) {
    const jsPath = jsMatch[1];
    console.log(`  外层 JS: ${jsPath}`);
    const jsRes = await httpsRequest({
      hostname: TARGET_HOST, port: TARGET_PORT, path: jsPath,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: false,
    });
    jsCode = jsRes.body;
    console.log(`  JS 大小: ${jsCode.length}`);
  }
  
  // 使用管线解密
  // 需要设置 gv 的状态
  const ts = { nsd, cd };
  
  // 手动解密 cd 获取 keys
  // 使用 src/handler/parser/tscd.js
  gv._setAttr('ts', ts);
  
  // 初始化配置
  try {
    gv._setAttr('argv', { mate: { jscode: { code: jsCode }, url: `https://${TARGET_HOST}:${TARGET_PORT}/` } });
    config(gv);
  } catch(e) {
    console.log('  配置初始化:', e.message.substring(0, 80));
  }
  
  // 初始化 r2mka 和 tscp
  try {
    const coder = new Coder({ hasCodemap: true, ...ts }, gv.config?.immucfg || {});
    const { $_ts } = coder.run();
    
    // 现在 gv.keys 应该已经设置
    const keys = gv.keys;
    if (!keys || !keys[2]) {
      console.log('  ❌ keys 未设置');
      return;
    }
    
    console.log(`  keys 数量: ${Object.keys(keys).length}`);
    console.log(`  keys[2] (session_data): ${keys[2]?.length}B`);
    console.log(`  keys[16]: ${keys[16]?.length}B [${keys[16]?.join(',')}]`);
    console.log(`  keys[17]: ${keys[17]?.length}B [${keys[17]?.join(',')}]`);
    
    // 提取 query 参数名
    const k7str = String.fromCharCode(...keys[7]);
    const paramName = k7str.split(';')[1];
    const cookieName = k7str.split(';')[5];
    console.log(`  query 参数名: ${paramName}`);
    console.log(`  cookie 名: ${cookieName}`);
    
    // [3] 生成 cookie
    console.log('\n[3] 生成 cookie...');
    const Cookie = require('@src/handler/Cookie');
    const cookie = new Cookie(coder).run();
    console.log(`  P cookie: ${cookie.substring(0, 40)}... (${cookie.length} chars)`);
    
    // [4] 构造 query
    console.log('\n[4] 构造 query...');
    
    const sessionData = keys[2]; // 48B
    const keys17 = keys[17]; // 16B
    
    // 构造 24B 明文
    const url = '/px-gateway/GatewayConfig/getGatewayConfig';
    const urlUpper = url.toUpperCase();
    const urlCrc = crc32([...urlUpper].map(c => c.charCodeAt(0)));
    
    // 随机 bytes[0-12] 和 bytes[13-15]
    const sessionId = Array.from(crypto.randomBytes(13));
    const nonce = Array.from(crypto.randomBytes(3));
    const counter = 1; // 初始计数器
    const sessionConst = 0; // 测试用 0
    
    const plaintext = [
      ...sessionId,           // [0-12] 会话标识 (13B) — 随机
      ...nonce,               // [13-15] 随机数 (3B)
      183, sessionConst,      // [16-17] 常量
      (counter >> 8) & 255, counter & 255,  // [18-19] 计数器
      (urlCrc >> 24) & 255, (urlCrc >> 16) & 255, (urlCrc >> 8) & 255, urlCrc & 255,  // [20-23] CRC32(URL)
    ];
    
    console.log(`  明文 (24B): [${plaintext.join(',')}]`);
    
    // 加密
    const [arr21] = numarrAddTime([...keys17]);
    const requestData = encryptMode1([...plaintext], [...arr21], 0);
    console.log(`  request_data (32B): [${requestData.slice(0, 10).join(',')}]`);
    
    // 组装 query
    const payload = numarrJoin(
      [1, 0],  // 版本和类型
      [...sessionData],  // 48B
      [...requestData],  // 32B
    );
    
    // 等等，numarrJoin 的格式不对。让我重新构造
    // 正确格式：[1][0][48][session_data 48B][32][request_data 32B]
    const payloadCorrect = [
      1, 0,
      sessionData.length, ...sessionData,
      requestData.length, ...requestData,
    ];
    
    // CRC32
    const payloadCrc = crc32(payloadCorrect);
    const queryBytes = [
      (payloadCrc >> 24) & 255, (payloadCrc >> 16) & 255, (payloadCrc >> 8) & 255, payloadCrc & 255,
      ...payloadCorrect,
    ];
    
    console.log(`  query bytes: ${queryBytes.length}B (期望 88B)`);
    
    // 编码
    const queryStr = '0' + numarr2string(queryBytes);
    console.log(`  query: ${queryStr.substring(0, 60)}... (${queryStr.length} chars)`);
    
    // [5] 发送 POST 请求
    console.log('\n[5] 发送 POST...');
    const postPath = `${url}?${paramName}=${queryStr}`;
    const postBody = '{}';
    
    const resPost = await httpsRequest({
      hostname: TARGET_HOST, port: TARGET_PORT, path: postPath,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Content-Type': 'application/json;charset=UTF-8',
        'Cookie': `${cookieName}O=${oCookie}; ${cookieName}P=${cookie}`,
        'Origin': `https://${TARGET_HOST}:${TARGET_PORT}`,
        'Referer': `https://${TARGET_HOST}:${TARGET_PORT}/`,
      },
      rejectUnauthorized: false,
    }, postBody);
    
    console.log(`  ★ 状态: ${resPost.status}`);
    console.log(`  响应: ${resPost.body.substring(0, 200)}`);
    
    if (resPost.status === 200) {
      console.log('\n  ★★★ 纯算法 POST 成功！！！');
    } else if (resPost.status === 412) {
      console.log('\n  ❌ 412 — query 被拒绝');
    } else {
      console.log(`\n  状态 ${resPost.status}`);
    }
    
    // [6] 也测试 GET 请求（不需要 query）
    console.log('\n[6] 测试 GET...');
    const resGet = await httpsRequest({
      hostname: TARGET_HOST, port: TARGET_PORT, path: '/px-gateway/GatewayConfig/security',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': `${cookieName}O=${oCookie}; ${cookieName}P=${cookie}`,
      },
      rejectUnauthorized: false,
    });
    console.log(`  GET 状态: ${resGet.status}`);
    
  } catch(e) {
    console.log('  错误:', e.message);
    console.log(e.stack?.substring(0, 500));
  }
  
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
