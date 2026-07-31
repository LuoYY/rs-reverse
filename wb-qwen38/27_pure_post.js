/**
 * 27_pure_post.js
 * 
 * 纯算法 POST：复用现有管线生成 cookie + 新增 query 生成
 * 
 * 已破解的 query 生成算法：
 * 1. session_data = keys[2]（cd 解密产物，48B）
 * 2. request_data = encryptMode1(plaintext_24B, numarrAddTime(keys17), 0)
 * 3. plaintext = [session_id_13B][nonce_3B][183][session_const][counter_2B][CRC32(URL.upper)_4B]
 * 4. query = '0' + numarr2string([CRC32(payload)] + payload)
 * 5. payload = [1, 0, 48, ...session_data, 32, ...request_data]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// 初始化管线
require('module-alias')(path.join(__dirname, '..'));
const gv = require('@src/handler/globalVarible');
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarr2string = require('@src/handler/parser/common/numarr2string');

// 复用现有管线
const { PmosXjClient } = require('../pmos_xj_client');

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

class PurePostClient {
  constructor() {
    this.client = new PmosXjClient();
    this.counter = 1;
    this.sessionId = null;
    this.sessionConst = 0;
    this.paramName = null;
    this.cookieName = null;
    this.oCookie = '';
    this.pCookie = '';
  }
  
  async init() {
    // Monkey-patch _genCookie 来捕获 keys
    const origGenCookie = this.client._genCookie.bind(this.client);
    let capturedKeys = null;
    
    this.client._genCookie = async (ts, cp3) => {
      const result = await origGenCookie(ts, cp3);
      // _genCookie 内部设置了 gv.keys，但 require cache 被清了
      // 需要在 _genCookie 内部捕获
      return result;
    };
    
    // 直接修改 _genCookie 的源码逻辑：在 return 前捕获 keys
    // 更好的方法：重写 _genCookie
    const client = this.client;
    const origFetchChallenge = client._fetchChallenge.bind(client);
    
    // 完全重写初始化流程
    console.log('[PurePost] 获取 412 挑战页...');
    const { nsd, cd, oCookie } = await origFetchChallenge();
    this.oCookie = oCookie;
    
    const cp3 = client._extractCp3(nsd, cd);
    const ts = { nsd, cd, from: client.baseUrl, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
    
    // 手动执行 _genCookie 的逻辑，但捕获 keys
    const fs = require('fs');
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('../utils/paths').package));
    const gv2 = require('@src/handler/globalVarible');
    const { getCode } = require('@utils/');
    const tmpTs = '/tmp/pmos-xj-ts-pure.json';
    fs.writeFileSync(tmpTs, JSON.stringify(ts));
    const OUTER_JS = path.join(__dirname, '../example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');
    const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, '../output'), level: 'warn', _: ['makecookie'] };
    const codeRet = await getCode(argv.jsurls);
    argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
    gv2._setAttr('argv', argv);
    require('@src/config/')(gv2);
    gv2._setAttr('_ts', ts);
    const Coder = require('@src/handler/Coder');
    const Cookie = require('@src/handler/Cookie');
    const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv2.config.immucfg);
    const { $_ts: fullTs, codemap } = coder.run();
    fullTs.cp[3] = cp3;
    gv2.config.codemap = codemap;
    const cookie = new Cookie(coder).run();
    
    // ★ 捕获 keys！
    const keys = gv2.keys;
    this.keys2 = Array.from(keys[2]);   // session_data (48B)
    this.keys17 = Array.from(keys[17]); // query 加密密钥
    this.keys16 = Array.from(keys[16]); // cookie 外层密钥
    
    // 提取参数名
    const k7str = gv2.utils.ascii2string(keys[7]);
    const parts = k7str.split(';');
    this.paramName = parts[1];
    this.cookieName = parts[5];
    this.pCookie = cookie;
    
    // 验证 cookie
    const name = this.cookieName + (gv2.config.adapt?.lastWord || 'T');
    const header = `${oCookie}; ${name}=${cookie}`;
    const replay = await client._httpGet(client.baseUrl, header);
    
    if (replay.status !== 200) {
      throw new Error(`Cookie 验证失败: ${replay.status}`);
    }
    
    this.cookieHeader = header;
    this.client.cookieHeader = header;
    this.client.ready = true;
    
    // 生成随机会话标识（13B）
    this.sessionId = Array.from(crypto.randomBytes(13));
    
    // 重新初始化管线的 encryptMode1（因为 require cache 被清了）
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(path.dirname(require('../utils/paths').package));
    const gv3 = require('@src/handler/globalVarible');
    require('@src/handler/parser/constData').init();
    this._encryptMode1 = require('@src/handler/parser/common/modeEncrypt').encryptMode1;
    this._numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
    this._numarr2string = require('@src/handler/parser/common/numarr2string');
    
    console.log(`  ✓ Cookie 有效 (${replay.status})`);
    console.log(`  keys[2] (session_data): ${this.keys2.length}B`);
    console.log(`  keys[17]: [${this.keys17.join(',')}]`);
    console.log(`  paramName: ${this.paramName}`);
    console.log(`  cookieName: ${this.cookieName}`);
    
    return this;
  }
  
  generateQuery(urlPath) {
    // CRC32(URL.toUpperCase())
    const urlUpper = urlPath.toUpperCase();
    const urlCrc = crc32([...urlUpper].map(c => c.charCodeAt(0)));
    
    // 构造 24B 明文
    const nonce = Array.from(crypto.randomBytes(3));
    const counterHi = (this.counter >> 8) & 255;
    const counterLo = this.counter & 255;
    
    const plaintext = [
      ...this.sessionId,      // [0-12] 会话标识 (13B)
      ...nonce,               // [13-15] 随机数 (3B)
      183, this.sessionConst, // [16-17] 常量
      counterHi, counterLo,   // [18-19] 计数器
      (urlCrc >> 24) & 255, (urlCrc >> 16) & 255, (urlCrc >> 8) & 255, urlCrc & 255, // [20-23]
    ];
    
    this.counter += 2;
    
    // 加密
    const [arr21] = this._numarrAddTime([...this.keys17]);
    const requestData = this._encryptMode1([...plaintext], [...arr21], 0);
    
    // 组装 payload: [1, 0, 48, session_data, 32, request_data]
    const payload = [
      1, 0,
      this.keys2.length, ...this.keys2,
      requestData.length, ...requestData,
    ];
    
    // CRC32(payload)
    const payloadCrc = crc32(payload);
    const queryBytes = [
      (payloadCrc >> 24) & 255, (payloadCrc >> 16) & 255,
      (payloadCrc >> 8) & 255, payloadCrc & 255,
      ...payload,
    ];
    
    return '0' + this._numarr2string(queryBytes);
  }
  
  async post(urlPath, body = '{}') {
    const query = this.generateQuery(urlPath);
    const fullPath = `${urlPath}?${this.paramName}=${query}`;
    
    const res = await httpsRequest({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path: fullPath,
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Content-Type': 'application/json;charset=UTF-8',
        'Cookie': this.cookieHeader,
        'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
        'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
        'ClientTag': 'OUTNET_BROWSE',
        'CurrentRoute': '/outNet',
        'Intercept-Headers': 'SKIP',
        'X-Ticket': 'undefined',
        'X-Token': 'null',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      rejectUnauthorized: false,
    }, body);
    
    return { status: res.status, body: res.body };
  }
  
  async get(urlPath) {
    const res = await httpsRequest({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path: urlPath,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': this.cookieHeader,
      },
      rejectUnauthorized: false,
    });
    return { status: res.status, body: res.body };
  }
}

async function main() {
  console.log('=== 纯算法 POST 测试 ===\n');
  
  const client = new PurePostClient();
  
  console.log('[1] 初始化管线...');
  await client.init();
  
  // [2] 测试 GET
  console.log('\n[2] 测试 GET...');
  const getRes = await client.get('/px-gateway/GatewayConfig/security');
  console.log(`  GET security: ${getRes.status}`);
  
  // [3] 测试多个 POST 端点
  const tests = [
    { name: 'POST verifyType', path: '/px-common-authcenter/auth/v2/verifyType/get', body: '{}' },
    { name: 'POST captcha', path: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
    { name: 'POST getGatewayConfig', path: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { name: 'POST selectByCondition', path: '/px-common-authority/marketMapping/selectByCondition', body: '{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}' },
    { name: 'POST security', path: '/px-gateway/GatewayConfig/security', body: '{}' },
  ];
  
  const results = [{ name: 'GET security', status: getRes.status }];
  
  for (const t of tests) {
    const res = await client.post(t.path, t.body);
    console.log(`  ${t.name}: ${res.status} ${res.body.substring(0, 100)}`);
    results.push({ name: t.name, status: res.status });
  }
  
  let passed = 0;
  for (const r of results) {
    const ok = r.status === 200;
    if (ok) passed++;
    console.log(`  ${ok ? '✅' : '❌'} ${r.name}: ${r.status}`);
  }
  console.log(`\n  通过率: ${passed}/${results.length}`);
  
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
