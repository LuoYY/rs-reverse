/**
 * query_freshness_test.js — 绝对新鲜的 cookie POST 测试
 *
 * 用户观察：curl 删 query → 412，说明 cookie 可能已过期/已使用
 * 
 * 方案：
 * 1. 管线生成全新 cookie
 * 2. 立即（< 1秒）用 Node.js POST
 * 3. 不经过浏览器（避免 cookie 被浏览器"使用"过）
 * 4. 测试带 query 和不带 query
 *
 * 关键：确保从 cookie 生成到 POST 请��的时间最短
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function request(method, path, cookie, body, query) {
  return new Promise(function(resolve) {
    var fullUrl = path;
    if (query) fullUrl += '?r20SZOQm=' + query;
    
    var headers = {
      'Cookie': cookie,
      'User-Agent': UA,
      'Accept': 'application/json, text/plain, */*',
      'Origin': TARGET.replace(/\/$/, ''),
      'Referer': TARGET,
    };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json;charset=UTF-8';
    }
    
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn',
      port: 20080,
      path: fullUrl,
      method: method,
      rejectUnauthorized: false,
      headers: headers,
    }, function(res) {
      var d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, t: Date.now() }));
    });
    req.on('error', e => resolve({ error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== 绝对新鲜 cookie POST 测试 ===\n');

  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');

  // 循环测试 3 次
  for (var round = 0; round < 3; round++) {
    console.log('\n--- Round ' + (round + 1) + ' ---');
    
    // 1. 获取挑战页 + O cookie
    var ch = await httpGet(TARGET, { userAgent: UA });
    var sc = [].concat(ch.headers['set-cookie'] || []);
    var oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
    var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    
    // 2. 管线生成 P cookie
    var client = new PmosXjClientProxy();
    await client.init();
    var cp3 = client._extractCp3(+m[1], m[2]);
    var ts = { nsd: +m[1], cd: m[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
    var gen = await client._genCookie(ts, cp3);
    var cookie = oCookie + '; ' + gen.name + '=' + gen.cookie;
    
    var t0 = Date.now();
    console.log('  Cookie generated at:', t0);
    
    // 3. 立即 GET 验证
    var getR = await request('GET', '/px-gateway/GatewayConfig/security', cookie);
    var t1 = Date.now();
    console.log('  GET (' + (t1 - t0) + 'ms):', getR.status, getR.status === 200 ? '✅' : '❌');
    
    // 4. 立即 POST 不带 query（第一次使用此 cookie POST）
    var postR1 = await request('POST', '/px-gateway/GatewayConfig/getGatewayConfig', cookie, '{}');
    var t2 = Date.now();
    console.log('  POST 无query (' + (t2 - t0) + 'ms):', postR1.status, postR1.status === 200 ? '✅' : '❌');
    if (postR1.body && postR1.body.length > 0 && postR1.body[0] === '{') {
      console.log('    body:', postR1.body.substring(0, 80));
    }
    
    // 5. 立即 POST 带 query（用一个假的 query）
    var postR2 = await request('POST', '/px-gateway/GatewayConfig/getGatewayConfig', cookie, '{}', '0FakeQuery123');
    var t3 = Date.now();
    console.log('  POST 假query (' + (t3 - t0) + 'ms):', postR2.status, postR2.status === 200 ? '✅' : '❌');
    
    // 6. 第二次 POST（同一个 cookie，测试一次性）
    var postR3 = await request('POST', '/px-gateway/GatewayConfig/getGatewayConfig', cookie, '{}');
    var t4 = Date.now();
    console.log('  POST 第二次 (' + (t4 - t0) + 'ms):', postR3.status, postR3.status === 200 ? '✅' : '❌');
    
    // 7. GET 再次（cookie 是否仍有效）
    var getR2 = await request('GET', '/px-gateway/GatewayConfig/security', cookie);
    var t5 = Date.now();
    console.log('  GET 再次 (' + (t5 - t0) + 'ms):', getR2.status, getR2.status === 200 ? '✅' : '❌');
    
    // 等待 2 秒再下一轮
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== 总结 ===');
  console.log('如果 POST 无query 全部 412:');
  console.log('  → POST 需要有效 query（不能绕过）');
  console.log('  → 需要逆向 query 算法');
  console.log();
  console.log('如果 POST 无query 第一次 200 后续 412:');
  console.log('  → cookie 一次性（POST 只能用一次）');
  console.log('  → 需要每次 POST 前重新生成 cookie');
  console.log();
  console.log('如果 POST 无query 全部 200:');
  console.log('  → 之前的测试 cookie 过期了');
  console.log('  → POST 不需要 query');

  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
