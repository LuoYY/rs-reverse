/**
 * query_node_post_final.js — Node.js POST 最终测试
 *
 * 重大发现：fetch 不带 query 就能 200！
 * 服务器不检查 query！query 只是 RS 自己的校验！
 *
 * 验证：Node.js 用管线 cookie 直接 POST（不带 query）
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function nodeRequest(method, path, cookie, body) {
  return new Promise(function(resolve) {
    var headers = { 'Cookie': cookie, 'User-Agent': UA };
    if (method === 'POST') headers['Content-Type'] = 'application/json;charset=UTF-8';
    
    var req = https.request({
      hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path, method,
      rejectUnauthorized: false, headers,
    }, function(res) {
      var d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ error: e.message }));
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== Node.js POST 最终测试 ===\n');

  // 生成新鲜管线 cookie
  console.log('[1] 管线生成新鲜 cookie...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  
  var ch = await httpGet(TARGET, { userAgent: UA });
  var sc = [].concat(ch.headers['set-cookie'] || []);
  var oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(+m[1], m[2]);
  var ts = { nsd: +m[1], cd: m[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  var gen = await client._genCookie(ts, cp3);
  var cookie = oCookie + '; ' + gen.name + '=' + gen.cookie;
  console.log('  Cookie ready');

  // GET 验证
  var getTest = await nodeRequest('GET', '/px-gateway/GatewayConfig/security', cookie);
  console.log('  GET:', getTest.status, getTest.status === 200 ? '✅' : '❌');

  // ★ POST 不带 query
  console.log('\n[2] ★ POST 不带 query...');
  var post1 = await nodeRequest('POST', '/px-gateway/GatewayConfig/getGatewayConfig', cookie, '{}');
  console.log('  Status:', post1.status, post1.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post1.body || '').substring(0, 100));

  // ★ POST 带 body
  console.log('\n[3] POST 带 body...');
  var body = JSON.stringify({"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}});
  var post2 = await nodeRequest('POST', '/px-common-authority/marketMapping/selectByCondition', cookie, body);
  console.log('  Status:', post2.status, post2.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post2.body || '').substring(0, 100));

  // ★ POST 另一个端点
  console.log('\n[4] POST captcha...');
  var post3 = await nodeRequest('POST', '/px-common-authcenter/auth/v2/captcha/get', cookie, '{}');
  console.log('  Status:', post3.status, post3.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post3.body || '').substring(0, 100));

  // ★ POST verifyType
  console.log('\n[5] POST verifyType...');
  var post4 = await nodeRequest('POST', '/px-common-authcenter/auth/v2/verifyType/get', cookie, '{}');
  console.log('  Status:', post4.status, post4.status === 200 ? '✅' : '❌');
  console.log('  Body:', (post4.body || '').substring(0, 100));

  console.log('\n=== 总结 ===');
  console.log('GET:', getTest.status);
  console.log('POST getGatewayConfig:', post1.status);
  console.log('POST selectByCondition:', post2.status);
  console.log('POST captcha:', post3.status);
  console.log('POST verifyType:', post4.status);
  
  var allOk = [getTest, post1, post2, post3, post4].every(r => r.status === 200);
  if (allOk) {
    console.log('\n★★★★★ 全部 200！ ★★★★★');
    console.log('★ POST 不需要 query 参数！');
    console.log('★ 纯 Node.js GET + POST 100% 可用！');
    console.log('★ 不需要浏览器！');
  }
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
