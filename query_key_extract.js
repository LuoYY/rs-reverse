/**
 * query_key_extract.js — 深入提取正确的加密密钥
 *
 * 思路转变：
 * 之前用 Array.prototype.slice hook 只捕获了 16 字节数组
 * 但 AES 密钥在 getCfg() 中被 combine4 转换为 uint32 数组
 * 然后用于 encode(cfg, val, idx, cfgnum)
 * 
 * cfg = getCfg(keyarr) 返回 [ret, arr]
 * ret = combine4(key) 后扩展的轮密钥（uint32 数组）
 * arr = 解密用的逆轮密钥
 * 
 * 关键：query 加密用的 key 经过 getCfg 后变成了轮密钥
 * 轮密钥是一个大的 uint32 数组（44 个元素 for AES-128）
 * 这个数组在 encode 函数中作为 cfg[0]（加密）或 cfg[1]（解密）
 * 
 * 所以我们需要捕获的不是 16 字节的原始 key
 * 而是 44 个 uint32 的轮密钥（176 字节）
 * 或者直接捕获 getCfg 的输入（16 字节 key）
 * 
 * 新方法：
 * 1. hook combine4 函数（getCfg 内部调用）
 * 2. combine4 的输入就是原始 16 字节 key
 * 3. 但 combine4 在 cookie 生成时也被调用
 * 4. 需要区分 cookie 的 key 和 query 的 key
 * 
 * 更好的方法：
 * 1. 在浏览器中 hook encode 函数（_$jT）
 * 2. encode 的第一个参数 cfg 包含轮密钥
 * 3. 从 cfg 可以反推出原始 key
 * 4. 或者直接用 cfg 来加密/解密
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
  console.log('=== 深入提取加密密钥 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, userAgent: UA,
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

  // 关键：hook 所有 44 元素数组（AES-128 轮密钥）
  // 和所有 176 字节数组（轮密钥的字节形式）
  // 以及 4 元素 uint32 数组（AES 状态/密钥单元）
  console.log('[3] 注入轮密钥 hook...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){
      window.__keys = [];
      var __inHook = false;
      
      // Hook slice — 捕获所有数组
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        var result = origSlice.apply(this, arguments);
        if (!__inHook) {
          __inHook = true;
          try {
            // 捕获 44 元素数组（AES-128 轮密钥）
            if (result.length === 44) {
              var allNum = true;
              for (var i = 0; i < 5; i++) {
                if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
              }
              if (allNum) {
                window.__keys.push({ t: 'roundkey44', d: result.slice(0, 44), src: this.length });
              }
            }
            // 捕获源数组也是 44 的
            if (this.length === 44 && result.length >= 4) {
              var allNum2 = true;
              for (var i = 0; i < 5; i++) {
                if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum2 = false; break; }
              }
              if (allNum2) {
                window.__keys.push({ t: 'from44', d: origSlice.call(this, 0, 44), start: arguments[0], end: arguments[1] });
              }
            }
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      // Hook concat — 捕获拼接结果
      var origConcat = Array.prototype.concat;
      Array.prototype.concat = function() {
        var result = origConcat.apply(this, arguments);
        if (!__inHook && result.length === 44) {
          __inHook = true;
          try {
            var allNum = true;
            for (var i = 0; i < 5; i++) {
              if (typeof result[i] !== 'number' || isNaN(result[i])) { allNum = false; break; }
            }
            if (allNum) {
              window.__keys.push({ t: 'concat44', d: result.slice(0, 44) });
            }
          } catch(e) {}
          __inHook = false;
        }
        return result;
      };
      
      return 'ok';
    })()`,
  });

  // 触发 POST
  console.log('[4] 触发 POST...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); } catch(e) {} 'done'; })()`,
  });
  await page.waitForTimeout(500);

  if (!queryValue) {
    var urlResult = await client.send('Runtime.evaluate', {
      expression: `(function(){ try { var x = new XMLHttpRequest(); x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false); x.send('{}'); var m = (x.responseURL||'').match(/r20SZOQm=([^&]+)/); return m ? m[1] : ''; } catch(e) { return ''; } })()`,
      returnByValue: true,
    });
    queryValue = urlResult.result.value;
  }
  console.log('  Query:', queryValue ? queryValue.substring(0, 50) + '...' : 'NONE');

  // 获取捕获的轮密钥
  var keysResult = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__keys || [])',
    returnByValue: true,
  });
  var keysData = JSON.parse(keysResult.result.value);
  console.log('  捕获 44 元素数组:', keysData.length);
  
  // 去重
  var seen = new Set();
  var uniqueKeys = [];
  keysData.forEach(function(k) {
    var key = k.d.join(',');
    if (!seen.has(key)) { seen.add(key); uniqueKeys.push(k); }
  });
  console.log('  唯一:', uniqueKeys.length);
  uniqueKeys.forEach(function(k, i) {
    console.log('  [' + i + '] type=' + k.t + ':', k.d.slice(0, 8).map(function(x) { return '0x' + (x >>> 0).toString(16); }).join(' '), '...');
  });

  await browser.close();

  if (!queryValue || queryValue.length < 10) {
    console.log('FATAL: 无 query');
    process.exit(1);
  }

  // 用管线解密
  console.log('\n[5] 用管线 encryptMode2 解密...');
  var { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: UA });
  var m2 = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  var pipeClient = new PmosXjClientProxy();
  await pipeClient.init();
  var cp3 = pipeClient._extractCp3(+m2[1], m2[2]);
  await pipeClient._genCookie({ nsd: +m2[1], cd: m2[2], from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: cp3 }, cp3);
  
  var gv = require('@src/handler/globalVarible');
  var { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  var combine4 = require('@src/handler/parser/common/combine4');
  
  var qBytes = decodeQuery(queryValue);
  var sessionData = qBytes.slice(7, 55);
  var requestData = qBytes.slice(56, 88);
  
  console.log('  session_data (48B):', sessionData.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  console.log('  request_data (32B):', requestData.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
  
  // 方法1：用 44 元素轮密钥反推原始 key
  // 轮密钥的前 4 个 uint32 = combine4(原始 key)
  // combine4 将 16 字节 → 4 个 uint32（大端）
  // 所以原始 key = bytes from first 4 uint32
  
  console.log('\n[6] 从轮密钥反推原始 key...');
  uniqueKeys.forEach(function(k, ki) {
    if (k.t !== 'roundkey44' && k.t !== 'concat44' && k.t !== 'from44') return;
    
    // 前 4 个 uint32 = 原始 key 的 combine4 结果
    var u32 = k.d.slice(0, 4);
    // 反 combine4：uint32 → 4 bytes（大端）
    var keyBytes = [];
    for (var i = 0; i < 4; i++) {
      keyBytes.push((u32[i] >>> 24) & 0xFF);
      keyBytes.push((u32[i] >>> 16) & 0xFF);
      keyBytes.push((u32[i] >>> 8) & 0xFF);
      keyBytes.push(u32[i] & 0xFF);
    }
    
    console.log('\n  Key[' + ki + '] (' + k.t + '):');
    console.log('    u32[0:4]:', u32.map(function(x) { return '0x' + (x >>> 0).toString(16); }));
    console.log('    key bytes:', keyBytes.map(function(b) { return (b&0xFF).toString(16).padStart(2,'0'); }).join(' '));
    
    // 用这个 key 尝试 encryptMode2
    [0, 1].forEach(function(flag) {
      try {
        var sDec = encryptMode2([...sessionData], keyBytes, flag);
        if (sDec && sDec.length > 0) {
          var ascii = sDec.filter(function(b) { return b >= 32 && b <= 126; }).length / sDec.length;
          if (ascii > 0.5 || sDec.length < 10) {
            console.log('    ★ session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii*100).toFixed(0) + '% ASCII');
            console.log('      str:', Buffer.from(sDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 48));
          } else {
            console.log('    session f=' + flag + ': ' + sDec.length + 'B, ' + (ascii*100).toFixed(0) + '% ASCII');
          }
        }
      } catch(e) {
        console.log('    session f=' + flag + ': ERROR');
      }
      
      try {
        var rDec = encryptMode2([...requestData], keyBytes, flag);
        if (rDec && rDec.length > 0) {
          var ascii = rDec.filter(function(b) { return b >= 32 && b <= 126; }).length / rDec.length;
          if (ascii > 0.5 || rDec.length < 10) {
            console.log('    ★ request f=' + flag + ': ' + rDec.length + 'B, ' + (ascii*100).toFixed(0) + '% ASCII');
            console.log('      str:', Buffer.from(rDec.map(function(b) { return b & 0xFF; })).toString('utf8').substring(0, 32));
          }
        }
      } catch(e) {}
    });
  });
  
  // 方法2：直接用轮密钥（跳过 getCfg）
  // 如果我们有完整的 44 元素轮密钥
  // 可以直接调用 encode 函数
  console.log('\n[7] 直接用轮密钥调用 encode...');
  
  // 管线的 encode 函数需要 cfg[idx] 作为轮密钥
  // cfg[0] = 加密轮密钥
  // cfg[1] = 解密轮密钥
  // encode(cfg, val, idx, cfgnum)
  
  // 但 encryptMode2 内部调用 getCfg(key) 来生成 cfg
  // 如果我们已经有轮密钥，可以跳过 getCfg
  
  uniqueKeys.forEach(function(k, ki) {
    if (k.d.length < 44) return;
    
    // 构造 cfg
    // getCfg 返回 [ret, arr]
    // ret = 加密轮密钥（用于 encode idx=0）
    // arr = 解密轮密钥（用于 encode idx=1）
    // encryptMode2 用 idx=1（解密）
    
    // 但我们只有轮密钥的前半部分
    // 需要完整的 ret 和 arr
    
    // 检查这个轮密钥是否与管线的 keys16 一致
    var pipeKeys16 = gv.keys[16].slice(0, 16);
    var pipeU32 = combine4(pipeKeys16);
    
    var matchPipe = true;
    for (var i = 0; i < 4; i++) {
      if ((k.d[i] >>> 0) !== (pipeU32[i] >>> 0)) { matchPipe = false; break; }
    }
    
    if (matchPipe) {
      console.log('  Key[' + ki + '] = 管线 keys16 的轮密钥！');
    }
  });
  
  // 保存
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/roundkey-captures.json'),
    JSON.stringify({ query: queryValue, keys: uniqueKeys }, null, 2)
  );

  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
