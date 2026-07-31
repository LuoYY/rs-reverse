/**
 * query_final_breakthrough.js — 最终突破：同会话提取密钥 + 管线生成 query
 *
 * 已知：
 * 1. RS 动态代码中的 _$jT = 管线 encode 函数（AES 核心）
 * 2. 子程序 109 = encryptMode1（AES 加密）
 * 3. query 的 session_data/request_data 是 encryptMode1(key, data) 的输出
 * 4. 密钥在 send hook 的闭包 scope 中
 *
 * 方案：
 * 1. 浏览器加载页面 → RS 初始化
 * 2. CDP 提取 send hook 的 [[Scopes]]
 * 3. 在 scope 中找到 AES cfgnum（S-Box 表）和密钥
 * 4. 同时捕获同会话的 query 值
 * 5. 用管线 encryptMode2(key) 解密 query → 验证
 * 6. 如果验证成功 → 用管线 encryptMode1 生成新 query
 *
 * 关键改进：
 * - 同时提取 cfgnum（5 个 256 元素表）和密钥
 * - 用同会话的 cfgnum + 密钥在 Node.js 中复现 AES
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

// 提取数组内容（递归获取）
async function extractArray(client, objectId, maxLen) {
  var props = await client.send('Runtime.getProperties', { objectId: objectId, ownProperties: true });
  var arr = [];
  for (var i = 0; i < Math.min(props.result.length, maxLen || 256); i++) {
    var elem = props.result[i];
    if (elem.value) {
      if (elem.value.type === 'number') arr.push(elem.value.value);
      else if (elem.value.type === 'undefined') arr.push(null);
      else arr.push(null);
    } else {
      arr.push(null);
    }
  }
  return arr;
}

(async () => {
  console.log('=== 最终突破：同会话密钥 + query 生成 ===\n');

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

  // Step 1: 提取 send hook 的 [[Scopes]]
  console.log('\n[3] 提取 send hook Scopes...');
  var sendEval = await client.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  var sendProps = await client.send('Runtime.getProperties', { objectId: sendEval.result.objectId, ownProperties: true });
  
  var scopesId = null;
  for (var ip of sendProps.internalProperties) {
    if (ip.name === '[[Scopes]]' && ip.value && ip.value.objectId) { scopesId = ip.value.objectId; break; }
  }
  
  var scopeList = await client.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  // 遍历所有 scope，提取所有变量（重点关注数组和函数）
  var allVars = {};
  var cfgnumCandidate = null;
  
  for (var si = 0; si < scopeList.result.length; si++) {
    var scope = scopeList.result[si];
    if (!scope.value || !scope.value.objectId) continue;
    
    var scopeVars = await client.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (var vi = 0; vi < scopeVars.result.length; vi++) {
      var v = scopeVars.result[vi];
      if (!v.value) continue;
      
      var varInfo = { name: v.name, scope: si, type: v.value.type, desc: v.value.description || '' };
      
      if (v.value.type === 'object' && v.value.description && v.value.description.indexOf('Array') >= 0) {
        var lenMatch = v.value.description.match(/Array\((\d+)\)/);
        varInfo.arrayLen = lenMatch ? parseInt(lenMatch[1]) : 0;
        varInfo.objectId = v.value.objectId;
        
        // 提取小数组的内容
        if (varInfo.arrayLen >= 16 && varInfo.arrayLen <= 256) {
          varInfo.data = await extractArray(client, v.value.objectId, varInfo.arrayLen);
        }
      } else if (v.value.type === 'function') {
        varInfo.funcDesc = (v.value.description || '').substring(0, 100);
      }
      
      allVars[v.name + '_s' + si] = varInfo;
    }
  }
  
  // 找到 256 元素数组（S-Box 候选）
  var sboxCandidates = Object.values(allVars).filter(function(v) {
    return v.arrayLen === 256 && v.data;
  });
  console.log('  256 元素数组:', sboxCandidates.length);
  sboxCandidates.forEach(function(v) {
    // 检查是否是 S-Box（值在 0-255 范围内且不重复）
    var vals = v.data.filter(function(x) { return x !== null; });
    var unique = new Set(vals).size;
    console.log('  ' + v.name + ' (Scope ' + v.scope + '): ' + vals.length + ' values, ' + unique + ' unique');
    console.log('    first 16:', vals.slice(0, 16).map(function(x) { return (x & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });
  
  // 找到 16 元素纯数字数组（密钥候选）
  var keyCandidates = Object.values(allVars).filter(function(v) {
    return v.arrayLen === 16 && v.data && v.data.every(function(x) { return typeof x === 'number'; });
  });
  console.log('\n  16 元素纯数字数组:', keyCandidates.length);
  keyCandidates.forEach(function(v) {
    console.log('  ' + v.name + ' (Scope ' + v.scope + '):', v.data.map(function(x) { return (x & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });
  
  // 找到 4 元素数组（可能是 uint32 key）
  var u32Candidates = Object.values(allVars).filter(function(v) {
    return v.arrayLen === 4 && v.data && v.data.every(function(x) { return typeof x === 'number'; });
  });
  console.log('\n  4 元素数组:', u32Candidates.length);
  u32Candidates.forEach(function(v) {
    console.log('  ' + v.name + ':', v.data);
  });

  // Step 2: 触发 POST 获取 query
  console.log('\n[4] 触发 POST...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);
  
  if (!queryValue) {
    // 用 responseURL 获取
    var urlResult = await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); var m = (x.responseURL||'').match(/r20SZOQm=([^&]+)/); return m ? m[1] : ''; } catch(e) { return ''; } })()`,
      returnByValue: true,
    });
    queryValue = urlResult.result.value;
  }
  
  console.log('  Query:', queryValue ? queryValue.substring(0, 60) + '...' : 'NONE');
  
  if (!queryValue || queryValue.length < 10) {
    console.log('FATAL: 无 query');
    await browser.close();
    process.exit(1);
  }

  // Step 3: 获取 cookie（同会话）
  var cookieResult = await client.send('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true });
  var browserCookie = cookieResult.result.value;
  
  await browser.close();

  // Step 4: 在 Node.js 中用管线解密
  console.log('\n[5] 用管线解密 query...');
  
  // 初始化管线获取 gv.cfgnum
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  
  // 用浏览器的 cookie 来获取同会话的 nsd/cd
  // 实际上 nsd/cd 在页面加载时就确定了
  // 我们需要用新的 nsd/cd 来初始化管线
  // 但这样 keys 会不同...
  
  // 关键：管线和浏览器必须用同一会话的 nsd/cd
  // 但我们无法获取浏览器加载时的 nsd/cd（已被 RS 清理）
  
  // 替代方案：直接用浏览器捕获的密钥 + 管线的 encryptMode2
  // 但管线的 cfgnum 可能与浏览器的不同
  
  // 检查：管线的 cfgnum 是否与浏览器的一致
  var ch2 = await httpGet(TARGET, { userAgent: UA });
  var m2 = ch2.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var cp3 = pipeClient._extractCp3(+m2[1], m2[2]);
  await pipeClient._genCookie({ nsd: +m2[1], cd: m2[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  
  console.log('  管线 cfgnum[0][0] 长度:', gv.cfgnum[0][0].length);
  console.log('  管线 cfgnum[0][4] 长度:', gv.cfgnum[0][4].length);
  
  // 检查浏览器的 S-Box 是否与管线的一致
  if (sboxCandidates.length > 0) {
    var browserSBox = sboxCandidates[0].data;
    var pipeSBox = gv.cfgnum[0][0]; // 加密 S-Box
    
    console.log('\n  浏览器 S-Box[0:16]:', browserSBox.slice(0, 16).map(function(x) { return (x & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    console.log('  管线 S-Box[0:16]:', pipeSBox.slice(0, 16).map(function(x) { return (x & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    
    var sboxMatch = true;
    for (var i = 0; i < 16; i++) {
      if ((browserSBox[i] & 0xFF) !== (pipeSBox[i] & 0xFF)) { sboxMatch = false; break; }
    }
    console.log('  S-Box 匹配:', sboxMatch ? 'YES ★' : 'NO');
    
    if (sboxMatch) {
      console.log('\n  ★★★ S-Box 匹配！管线的 cfgnum 可以用于浏览器的 query！ ★★★');
      
      // 用浏览器捕获的密钥 + 管线 encryptMode2 解密 query
      var qBytes = decodeQuery(queryValue);
      var sessionData = qBytes.slice(7, 55);
      var requestData = qBytes.slice(56, 88);
      
      console.log('\n  session_data:', sessionData.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
      console.log('  request_data:', requestData.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
      
      // 用浏览器密钥尝试解密
      keyCandidates.forEach(function(kc, ki) {
        var key = kc.data.map(function(x) { return x & 0xFF; });
        console.log('\n  Key[' + ki + '] ' + kc.name + ':', key.map(function(b) { return b.toString(16).padStart(2, '0'); }).join(' '));
        
        [0, 1].forEach(function(flag) {
          try {
            var sDec = encryptMode2([...sessionData], key, flag);
            if (sDec && sDec.length > 0) {
              var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
              console.log('    session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii * 100).toFixed(0) + '% ASCII');
              if (ascii > 0.5 || sDec.length < 10) {
                console.log('      hex:', sDec.slice(0, 30).map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
                console.log('      str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 40));
              }
            }
          } catch(e) {}
          
          try {
            var rDec = encryptMode2([...requestData], key, flag);
            if (rDec && rDec.length > 0) {
              var ascii = rDec.filter(function(b) { return b >= 32 && b <= 126; }).length / rDec.length;
              console.log('    request f=' + flag + ': ' + rDec.length + 'B, ' + (ascii * 100).toFixed(0) + '% ASCII');
              if (ascii > 0.5 || rDec.length < 10) {
                console.log('      str:', Buffer.from(rDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 32));
              }
            }
          } catch(e) {}
        });
      });
    }
  }
  
  // 保存所有数据
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/final-breakthrough.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      query: queryValue,
      cookie: browserCookie,
      sboxCandidates: sboxCandidates.map(function(v) { return { name: v.name, scope: v.scope, data: v.data }; }),
      keyCandidates: keyCandidates.map(function(v) { return { name: v.name, scope: v.scope, data: v.data }; }),
      u32Candidates: u32Candidates.map(function(v) { return { name: v.name, data: v.data }; }),
    }, null, 2)
  );
  
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
