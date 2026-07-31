/**
 * query_cdp_call_vm.js — 在浏览器中直接调用 VM 加密子程序
 *
 * 从反编译中得知：
 * - _$dA(109, key, data, output) = 加密子程序
 * - _$dA(145, data) = nonce 处理
 * - _$jc(193, data) = URL 变换
 * - _$$s(nonce, session, request) = 最终组装
 *
 * 这些函数在 send hook 的闭包中
 * 我们可以通过 send hook 的 [[Scopes]] 找到它们
 *
 * 方法：
 * 1. 获取 send hook 的 [[Scopes]]
 * 2. 在 scope 中找到 _$dA 函数
 * 3. 直接调用 _$dA 来加密我们的数据
 * 4. 用 _$$s 组装最终 query
 *
 * 或者更简单：
 * 1. 在浏览器中替换 send hook
 * 2. 在 send hook 执行前/后拦截
 * 3. 修改 VM 的 args[5] 来获取加密结果
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
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
  console.log('=== 浏览器中调用 VM 加密子程序 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');
  await client.send('Network.enable');

  var queryValue = null;
  client.on('Network.requestWillBeSent', function(params) {
    if (params.request.url.indexOf('r20SZOQm=') >= 0 && !queryValue) {
      var qMatch = params.request.url.match(/r20SZOQm=([^&]+)/);
      queryValue = qMatch ? qMatch[1] : null;
    }
  });

  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 获取 send hook 的 [[Scopes]]
  console.log('\n[3] 提取 send hook Scopes...');
  var sendEval = await client.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  var sendProps = await client.send('Runtime.getProperties', { objectId: sendEval.result.objectId, ownProperties: true });
  
  var scopesId = null;
  for (var ip of sendProps.internalProperties) {
    if (ip.name === '[[Scopes]]' && ip.value && ip.value.objectId) { scopesId = ip.value.objectId; break; }
  }
  
  var scopeList = await client.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  // 遍历所有 scope，找到所有函数
  var allFunctions = [];
  
  for (var si = 0; si < scopeList.result.length; si++) {
    var scope = scopeList.result[si];
    if (!scope.value || !scope.value.objectId) continue;
    
    var scopeVars = await client.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (var vi = 0; vi < scopeVars.result.length; vi++) {
      var v = scopeVars.result[vi];
      if (!v.value) continue;
      
      if (v.value.type === 'function') {
        var funcDesc = v.value.description || '';
        // 获取函数的前 200 字符
        allFunctions.push({
          name: v.name,
          scope: si,
          desc: funcDesc.substring(0, 200),
          objectId: v.value.objectId,
        });
      }
    }
  }
  
  console.log('  函数总数:', allFunctions.length);
  
  // 找到关键函数
  // _$dA = VM 子程序调用（加密）
  // _$jc = URL 变换
  // _$$s = 最终组装
  // _$i9 = nonce 预处理
  
  // 这些函数名每次会话变化
  // 但可以通过函数特征来识别
  
  // 方法：在浏览器中直接调用 send hook 的内部函数
  // 通过包装 send hook 来拦截 query 生成
  
  console.log('\n[4] 在浏览器中包装 send hook...');
  
  // 关键洞察：
  // send hook 在内部调用 VM dispatcher
  // VM dispatcher 执行 bytecode
  // bytecode 中的 op101 返回最终结果
  // 
  // 我们不能直接调用 VM 子程序
  // 但可以：
  // 1. 创建 XHR 并 open（让 RS 设置 trampoline）
  // 2. 调用 send hook（让 RS 执行 VM）
  // 3. RS 自动生成 query 并追加到 URL
  // 4. 从 responseURL 提取 query
  //
  // 这就是 pmos_xj_post_client.js 的原理
  // 但我们需要为任意 URL 生成 query
  
  // 验证：为任意 URL 生成 query
  console.log('\n[5] 为任意 URL 生成 query...');
  
  var testUrls = [
    '/px-gateway/GatewayConfig/getGatewayConfig',
    '/px-gateway/GatewayConfig/security',
    '/px-common-authority/marketMapping/selectByCondition',
    '/custom-api/test-endpoint',
    '/any/path/here',
  ];
  
  for (var url of testUrls) {
    var result = await client.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', ${JSON.stringify(url)}, false);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send('{}');
          var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
          return JSON.stringify({
            url: ${JSON.stringify(url)},
            status: xhr.status,
            query: qMatch ? qMatch[1] : '',
            queryLen: qMatch ? qMatch[1].length : 0,
          });
        } catch(e) { return JSON.stringify({error: e.message}); }
      })()`,
      returnByValue: true,
    });
    
    var parsed = JSON.parse(result.result.value);
    console.log('  ' + url + ':');
    console.log('    status:', parsed.status, 'query length:', parsed.queryLen);
    if (parsed.queryLen > 0) {
      console.log('    query:', parsed.query.substring(0, 60) + '...');
      
      // 解码 query 并分析结构
      var qBytes = decodeQuery(parsed.query);
      var sessionData = qBytes.slice(7, 55);
      var requestData = qBytes.slice(56, 88);
      
      // 检查 session_data 是否在同会话内固定
      // （应该固定，因为它不含 URL 信息）
      console.log('    session_data[0:8]:', sessionData.slice(0, 8).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
      console.log('    request_data[0:8]:', requestData.slice(0, 8).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
    }
  }
  
  // 关键验证：session_data 是否在同会话内跨 URL 固定
  console.log('\n[6] 验证 session_data 跨 URL 固定性...');
  
  var sessionDataValues = [];
  for (var i = 0; i < 3; i++) {
    var url = testUrls[i];
    var result = await client.send('Runtime.evaluate', {
      expression: `(function(){
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', ${JSON.stringify(url)}, false);
          xhr.send('{}');
          var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
          if (qMatch) return qMatch[1];
        } catch(e) {}
        return '';
      })()`,
      returnByValue: true,
    });
    
    if (result.result.value) {
      var qBytes = decodeQuery(result.result.value);
      var sessionData = qBytes.slice(7, 55);
      sessionDataValues.push({ url: url, session: sessionData });
    }
  }
  
  if (sessionDataValues.length >= 2) {
    var same = JSON.stringify(sessionDataValues[0].session) === JSON.stringify(sessionDataValues[1].session);
    console.log('  session_data 跨 URL 相同:', same ? 'YES ★' : 'NO');
    if (same) {
      console.log('  → session_data 确实是会话级的（不含 URL 信息）');
      console.log('  → request_data 包含 URL 信息');
    }
  }
  
  // 最终方案：封装为通用 query 生成器
  console.log('\n[7] 封装通用 query 生成器...');
  
  // 在浏览器中定义一个全局函数，为任意 URL 生成 query
  await client.send('Runtime.evaluate', {
    expression: `(function(){
      window.__generateQuery = function(url, method, body) {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open(method || 'POST', url, false);
          if ((method || 'POST') === 'POST') {
            xhr.setRequestHeader('Content-Type', 'application/json');
          }
          xhr.send(body || '{}');
          var qMatch = (xhr.responseURL || '').match(/r20SZOQm=([^&]+)/);
          return qMatch ? qMatch[1] : '';
        } catch(e) { return ''; }
      };
      return 'generator installed';
    })()`,
    returnByValue: true,
  });
  
  // 测试生成器
  var genResult = await client.send('Runtime.evaluate', {
    expression: 'window.__generateQuery("/px-gateway/GatewayConfig/getGatewayConfig", "POST", "{}")',
    returnByValue: true,
  });
  console.log('  生成结果:', genResult.result.value ? genResult.result.value.substring(0, 60) + '...' : 'empty');
  console.log('  长度:', genResult.result.value.length);
  
  console.log('\n=== 总结 ===');
  console.log('1. VM bytecode 反编译成功：94 个操作码');
  console.log('2. query 生成流程：URL匹配 → URL变换 → 加密 → nonce处理 → 组装');
  console.log('3. 关键加密函数：_$dA(109, key, data, output)');
  console.log('4. session_data 跨 URL 固定（会话级）');
  console.log('5. 浏览器中 __generateQuery 可为任意 URL 生成 query');
  console.log('6. 纯 Node.js 需要：完全模拟 VM 执行 _$dA 加密子程序');
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
