/**
 * 用用户提供的 curl 数据精确测试 query 可重放性
 * 专门测试 selectByCondition 端点
 * 猜想：query 可能和 body 有关
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const https = require('https');

const COOKIE = 'aoU85Lxl9xxNO=60jsZMjbyTuqZmqwE8.MNOVF3F5Jpxi9m07prvQjkRK1cM9QWT1VNJYwwYP.RVnCn9hOGRbDj5_jquIhuYBOa2EG; aoU85Lxl9xxNP=0K70fXVy6MTIUuP2OhF9d6hE34MJ2Wtmzi7Z7jaoWwqcmUVOgox0tL.CPZTF13HGeTX4N1JJ8.d_cxECPtU.59fwTKmUSYV2aEHck7mNshPHjckQQ8.oWhE7wcbVr7neotBrchFq72.ovrFkCY9BRU4rXg.NrtYgC3izPM4ka7GG4wv5vNsUWyD1qB3obDEKMOsuQpfNw8byF8c4wvCHVnSL37Y1UkAliHBhByvjXs5POJ_nminKWHAmIviVzD.rifxvGYVShncvplwYW9LYRsyrSDZo4DhRHMDRX7c1yWqdywWX6fIPrZ9pggecGrx9icdy3Y.tatzyamIXm8mkIHWkVmAD9zmdfHO9h3rDo.jjKTwmo5bpLt9gBF.7L9J6rJy_6guzDPgG41rZ7BDZp3hsavK.pHTVS10pA7gpU83YFEroptdJ70TntKONhALZg';
const QUERY = '0cH2z6alqWiHiNwTDTT9ABh2FX7GJD.NfBm2SuajORE95nPDCafZ9eGKjFSigcTDA3gO0R8UCyPqWYfepRiGdjUYIG4KvLol4tcrO.g7P6Ic5ZfI7eyIXVA';
const BODY = '{"data":{"marketName":"","newMarketCode":"","newUrl":"","oldUrl":""},"pageInfo":{"pageSizes1":["20","50","100","200","500","1000"],"pageSizes":[20,50,100,200,500,1000],"pageSize":100,"pageNum":1}}';

function doRequest(method, path, headers, body) {
  return new Promise(function(resolve) {
    var options = {
      hostname: 'pmos.xj.sgcc.com.cn',
      port: 20080,
      path: path,
      method: method,
      rejectUnauthorized: false,
      headers: headers,
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve({ status: res.statusCode, body: data, headers: res.headers }); });
    });
    req.on('error', function(e) { resolve({ error: e.message }); });
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('=== Query 重放精确测试 ===\n');

  // 完全复制 curl 的请求头
  var fullHeaders = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Cache-Control': 'no-cache',
    'ClientTag': 'OUTNET_BROWSE',
    'Connection': 'keep-alive',
    'Content-Type': 'application/json;charset=UTF-8',
    'Cookie': COOKIE,
    'CurrentRoute': '/outNet',
    'Intercept-Headers': 'SKIP',
    'Origin': 'https://pmos.xj.sgcc.com.cn:20080',
    'Pragma': 'no-cache',
    'Referer': 'https://pmos.xj.sgcc.com.cn:20080/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    'X-Ticket': 'undefined',
    'X-Token': 'null',
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  };

  // 测试 1：完全复制 curl（带 query + 带 body）
  console.log('[1] 完全复制 curl（query + body）:');
  var r1 = await doRequest('POST', '/px-common-authority/marketMapping/selectByCondition?r20SZOQm=' + QUERY, fullHeaders, BODY);
  console.log('  status:', r1.status);
  console.log('  body:', (r1.body || '').substring(0, 120));
  
  if (r1.status === 200) {
    console.log('\n  ★★★ 完全复制 curl 成功！ ★★★');
    console.log('  → query 可重放！');
    console.log('  → 之前失败是因为请求头不完整');
  }

  // 测试 2：不带 body（测试 query 是否和 body 有关）
  console.log('\n[2] 带 query 不带 body:');
  var r2 = await doRequest('POST', '/px-common-authority/marketMapping/selectByCondition?r20SZOQm=' + QUERY, fullHeaders, '');
  console.log('  status:', r2.status);
  console.log('  body:', (r2.body || '').substring(0, 120));

  // 测试 3：带 query 但不同 body
  console.log('\n[3] 带 query 但不同 body:');
  var r3 = await doRequest('POST', '/px-common-authority/marketMapping/selectByCondition?r20SZOQm=' + QUERY, fullHeaders, '{"test":1}');
  console.log('  status:', r3.status);
  console.log('  body:', (r3.body || '').substring(0, 120));

  // 测试 4：多次重放（测试幂等检查）
  console.log('\n[4] 多次重放（幂等检查）:');
  for (var i = 0; i < 3; i++) {
    var r = await doRequest('POST', '/px-common-authority/marketMapping/selectByCondition?r20SZOQm=' + QUERY, fullHeaders, BODY);
    console.log('  [' + i + ']', r.status, (r.body || '').substring(0, 60));
  }

  // 测试 5：不带 query
  console.log('\n[5] 不带 query:');
  var r5 = await doRequest('POST', '/px-common-authority/marketMapping/selectByCondition', fullHeaders, BODY);
  console.log('  status:', r5.status);
  console.log('  body:', (r5.body || '').substring(0, 80));

  // 测试 6：GET（确认 cookie 有效）
  console.log('\n[6] GET（cookie 有效性）:');
  var getHeaders = Object.assign({}, fullHeaders);
  delete getHeaders['Content-Type'];
  var r6 = await doRequest('GET', '/px-gateway/GatewayConfig/security', getHeaders);
  console.log('  status:', r6.status);
  console.log('  body:', (r6.body || '').substring(0, 80));

  console.log('\n=== 总结 ===');
  console.log('1. 完全复制 curl:', r1.status);
  console.log('2. 不带 body:', r2.status);
  console.log('3. 不同 body:', r3.status);
  console.log('4. 多次重放:', '见上');
  console.log('5. 不带 query:', r5.status);
  console.log('6. GET:', r6.status);
  
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
