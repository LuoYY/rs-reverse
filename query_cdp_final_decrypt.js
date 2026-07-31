/**
 * query_cdp_final_decrypt.js — 最终同会话解密
 *
 * 问题：之前 Scopes 提取时 allKeys 为空
 * 原因：条件判断太严格（只允许纯数字数组，但实际数组可能包含 undefined）
 *
 * 修复：放宽条件，打印所有数组的内容
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
  console.log('=== 最终同会话解密 ===\n');

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
  console.log('\n[3] 提取 Scopes...');
  var sendEval = await client.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  var sendProps = await client.send('Runtime.getProperties', { objectId: sendEval.result.objectId, ownProperties: true });
  
  var scopesId = null;
  for (var ip of sendProps.internalProperties) {
    if (ip.name === '[[Scopes]]' && ip.value && ip.value.objectId) { scopesId = ip.value.objectId; break; }
  }
  
  var scopeList = await client.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  // 遍历所有 scope，提取所有数组（放宽条件）
  var allArrays = [];
  
  for (var si = 0; si < scopeList.result.length; si++) {
    var scope = scopeList.result[si];
    if (!scope.value || !scope.value.objectId) continue;
    
    var scopeVars = await client.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (var vi = 0; vi < scopeVars.result.length; vi++) {
      var v = scopeVars.result[vi];
      if (!v.value || !v.value.objectId) continue;
      if (v.value.type !== 'object') continue;
      if (!v.value.description || v.value.description.indexOf('Array') < 0) continue;
      
      // 获取数组内容（更宽松的条件）
      var arrProps = await client.send('Runtime.getProperties', { objectId: v.value.objectId, ownProperties: true });
      
      var arrData = [];
      var hasNum = false;
      for (var ai = 0; ai < arrProps.result.length; ai++) {
        var elem = arrProps.result[ai];
        if (elem.value) {
          if (elem.value.type === 'number') {
            arrData.push(elem.value.value);
            hasNum = true;
          } else if (elem.value.type === 'string') {
            arrData.push('"' + elem.value.value + '"');
          } else if (elem.value.type === 'undefined') {
            arrData.push(undefined);
          } else {
            arrData.push('[' + elem.value.type + ']');
          }
        } else {
          arrData.push(undefined);
        }
      }
      
      var lenMatch = v.value.description.match(/Array\((\d+)\)/);
      var arrLen = lenMatch ? parseInt(lenMatch[1]) : arrData.length;
      
      allArrays.push({ name: v.name, scope: si, length: arrLen, data: arrData, hasNum });
    }
  }

  // 显示所有数组
  console.log('\n所有数组:');
  allArrays.forEach(function(a) {
    if (a.hasNum && a.length >= 10) {
      var preview = a.data.slice(0, 10).map(function(x) {
        return typeof x === 'number' ? '0x' + (x & 0xFF).toString(16).padStart(2, '0') : String(x).substring(0, 15);
      });
      console.log('  Scope[' + a.scope + '] ' + a.name + ': Array(' + a.length + ') [' + preview.join(', ') + '...]');
    }
  });

  // 找到 16 字节的纯数字数组
  var keys16 = allArrays.filter(function(a) {
    return a.hasNum && a.length === 16 && a.data.every(function(x) { return typeof x === 'number'; });
  });
  
  console.log('\n16B 纯数字数组:', keys16.length);
  keys16.forEach(function(k, i) {
    console.log('  [' + i + '] Scope[' + k.scope + '] ' + k.name + ':', k.data.map(function(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
  });

  // 触发 POST
  console.log('\n[4] 触发 POST...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);

  // 加载管线
  console.log('\n[5] 加载管线...');
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: 'Mozilla/5.0' });
  var m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var client2 = new PmosXjClientProxy();
  await client2.init();
  var cp3 = client2._extractCp3(+m[1], m[2]);
  await client2._genCookie({ nsd: +m[1], cd: m[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);

  var gv = require('@src/handler/globalVarible');
  var { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');

  // 解密
  if (!queryValue) { console.log('FATAL: 无 query'); process.exit(1); }
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);

  console.log('\n[6] 用捕获的 keys 解密...');
  console.log('  session_data:', sessionData.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));
  console.log('  request_data:', requestData.map(b => (b&0xFF).toString(16).padStart(2,'0')).join(' '));

  // 用所有 16B key 尝试
  keys16.forEach(function(k, ki) {
    console.log('\nKey[' + ki + '] Scope[' + k.scope + '] ' + k.name + ':');
    var key = k.data.map(function(x) { return x & 0xFF; });
    
    [0, 1].forEach(function(flag) {
      try {
        var sDec = encryptMode2([...sessionData], key, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
          console.log('  session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
          if (ascii > 0.3) {
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
          if (ascii > 0.3) {
            console.log('    str:', Buffer.from(rDec.map(b=>b&0xFF)).toString('utf8').substring(0, 32));
          }
        }
      } catch(e) {}
    });
  });

  // 也尝试管线 keys16
  console.log('\n=== 管线 keys16 ===');
  [0, 1].forEach(function(flag) {
    try {
      var sDec = encryptMode2([...sessionData], gv.keys[16].slice(0, 16), flag);
      if (sDec && sDec.length > 0) {
        var ascii = sDec.filter(b => b >= 32 && b <= 126).length / sDec.length;
        console.log('  session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii*100).toFixed(0) + '%');
        if (ascii > 0.3) {
          console.log('    str:', Buffer.from(sDec.map(b=>b&0xFF)).toString('utf8').substring(0, 40));
        }
      }
    } catch(e) {}
  });

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
