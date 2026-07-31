/**
 * query_cdp_same_session_keys.js — 同一会话提取 keys + query + 解密
 *
 * 关键改进：在浏览器中同时提取 keys（从 send hook 闭包）和 query
 * 然后用同一会话的 keys 解密 query
 *
 * 文章启发：
 * - query 和 cookie 共享管线（相同的 encryptMode1/2 + basestr + numarrJoin）
 * - session_data 是 encryptMode1(keys) 加密的
 * - keys 在 send hook 的闭包 scope 中
 *
 * 方法：
 * 1. 在浏览器中获取 send hook 的 [[Scopes]]
 * 2. 在 scopes 中找到 keys（16B 数组）
 * 3. 同时捕获 query 值
 * 4. 用同一会话的 keys + encryptMode2 解密
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
  var rem = payload.length - i;
  if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
  else if (rem === 3) { bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4)); bytes.push(((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2)); }
  return bytes;
}

(async () => {
  console.log('=== 同一会话 keys + query + RS AES 解密 ===\n');

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

  // Step 1: 获取 send hook 的 [[Scopes]]，提取 keys
  console.log('\n[3] 提取 send hook 闭包 keys...');
  
  var sendEval = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
  });
  
  var sendProps = await client.send('Runtime.getProperties', {
    objectId: sendEval.result.objectId,
    ownProperties: true,
  });
  
  var scopesObjectId = null;
  for (var ip of sendProps.internalProperties) {
    if (ip.name === '[[Scopes]]' && ip.value && ip.value.objectId) {
      scopesObjectId = ip.value.objectId;
      break;
    }
  }
  
  if (!scopesObjectId) {
    console.log('FATAL: No Scopes');
    process.exit(1);
  }
  
  var scopeList = await client.send('Runtime.getProperties', {
    objectId: scopesObjectId,
    ownProperties: true,
  });

  // 提取所有 16 字节数字数组（密钥候选）
  var allKeys = [];
  
  for (var si = 0; si < scopeList.result.length; si++) {
    var scope = scopeList.result[si];
    if (!scope.value || !scope.value.objectId) continue;
    
    var scopeVars = await client.send('Runtime.getProperties', {
      objectId: scope.value.objectId,
      ownProperties: true,
    });
    
    for (var vi = 0; vi < scopeVars.result.length; vi++) {
      var v = scopeVars.result[vi];
      if (!v.value || !v.value.objectId) continue;
      if (v.value.type !== 'object' || !v.value.description || v.value.description.indexOf('Array') < 0) continue;
      
      // 获取数组内容
      var arrProps = await client.send('Runtime.getProperties', {
        objectId: v.value.objectId,
        ownProperties: true,
      });
      
      var arrData = [];
      var isNum = true;
      for (var ai = 0; ai < arrProps.result.length; ai++) {
        var elem = arrProps.result[ai];
        if (elem.value && elem.value.type === 'number') {
          arrData.push(elem.value.value & 0xFF);
        } else if (elem.value && elem.value.type === 'undefined') {
          isNum = false;
          break;
        } else {
          isNum = false;
          break;
        }
      }
      
      if (isNum && arrData.length >= 16 && arrData.length <= 48) {
        var name = v.name;
        var lenMatch = v.value.description.match(/Array\((\d+)\)/);
        var arrLen = lenMatch ? parseInt(lenMatch[1]) : arrData.length;
        allKeys.push({ name: name, scope: si, length: arrLen, data: arrData });
        console.log('  Scope[' + si + '] ' + name + ': Array(' + arrLen + ') ' + arrData.slice(0, 8).map(b => b.toString(16).padStart(2,'0')).join(' ') + '...');
      }
    }
  }

  // Step 2: 触发 POST 获取 query
  console.log('\n[4] 触发 POST 获取 query...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);

  console.log('  Query:', queryValue ? queryValue.substring(0, 60) + '...' : 'none');

  // Step 3: 加载管线
  console.log('\n[5] 加载管线...');
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  const { httpGet } = require('./proxy_http');
  
  var ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var nsd = +m[1], cd = m[2];
  
  var client2 = new PmosXjClientProxy();
  await client2.init();
  var cp3 = client2._extractCp3(nsd, cd);
  var ts2 = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 };
  await client2._genCookie(ts2, cp3);

  var gv = require('@src/handler/globalVarible');
  var { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  
  console.log('  管线 keys16:', gv.keys[16].slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('  管线 keys17:', gv.keys[17].slice(0, 16).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));

  // Step 4: 用同一会话的 keys 解密 query
  console.log('\n[6] 用同一会话 keys 解密 query...');
  
  if (!queryValue) {
    console.log('FATAL: 无 query');
    process.exit(1);
  }
  
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  console.log('  session_data (48B):', sessionData.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('  request_data (32B):', requestData.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));

  // 用所有捕获的 key 尝试 encryptMode2
  console.log('\n=== encryptMode2 解密 ===\n');
  
  var bestResult = { ascii: 0 };
  
  allKeys.forEach(function(k, ki) {
    if (k.length < 16) return;
    var key = k.data.slice(0, 16);
    
    console.log('Key[' + ki + '] Scope[' + k.scope + '] ' + k.name + ':');
    
    [0, 1].forEach(function(flag) {
      try {
        var sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
          console.log('  session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
          
          if (ascii > bestResult.ascii) {
            bestResult = { ascii, key: ki, name: k.name, target: 'session', flag, result: sDec };
          }
          
          if (ascii > 0.5 || sDec.length < 10) {
            console.log('    hex:', sDec.slice(0, 40).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
            console.log('    str:', Buffer.from(sDec.map(b=>b&0xFF)).toString('utf8').substring(0, 40));
          }
        }
      } catch(e) {}
      
      try {
        var rDec = encryptMode2([...requestData], key, flag);
        if (rDec && rDec.length > 0) {
          var ascii = rDec.filter(b => b >= 32 && b <= 126).length / rDec.length;
          console.log('  request f=' + flag + ': ' + rDec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
          
          if (ascii > bestResult.ascii) {
            bestResult = { ascii, key: ki, name: k.name, target: 'request', flag, result: rDec };
          }
          
          if (ascii > 0.5 || rDec.length < 10) {
            console.log('    str:', Buffer.from(rDec.map(b=>b&0xFF)).toString('utf8').substring(0, 32));
          }
        }
      } catch(e) {}
    });
  });

  console.log('\n=== 最佳结果 ===');
  console.log('ASCII:', (bestResult.ascii * 100).toFixed(1) + '%');
  console.log('Key:', bestResult.key, bestResult.name);
  console.log('Target:', bestResult.target, 'flag:', bestResult.flag);
  if (bestResult.result) {
    console.log('Result hex:', bestResult.result.slice(0, 48).map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
    console.log('Result str:', Buffer.from(bestResult.result.map(b=>b&0xFF)).toString('utf8').substring(0, 48));
  }

  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/same-session-keys-decrypt.json'),
    JSON.stringify({
      query: queryValue,
      queryBytes: qBytes,
      keys: allKeys.map(k => ({ name: k.name, scope: k.scope, length: k.length, data: k.data })),
      bestResult: bestResult,
      pipelineKeys16: gv.keys[16],
      pipelineKeys17: gv.keys[17],
    }, null, 2)
  );

  console.log('\n=== 完成 ===');
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
