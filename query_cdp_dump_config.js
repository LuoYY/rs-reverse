/**
 * query_cdp_dump_config.js — 提取 send hook 的 VM 配置对象
 *
 * 已知：
 * - send hook = VM trampoline
 * - 配置对象 = _$iH（本次会话）
 * - _$iH._$eT = bytecode
 * - _$iH._$aR = cache flag
 * - _$iH._$dx = scope size
 * - _$iH._$cV = 常量池
 * - dispatcher = _$j5
 *
 * Scopes 中有大量 RS 内部数据：
 * - Scope 1: _$ap = Array(1170), _$hK = Array(209), _$k2 = Array(583)
 * - Scope 2: _$bs = Array(489), _$i1 = Array(909), _$f7 = Array(1170)
 *
 * 关键：_$i1 = Array(909) 可能是常量池/字符串表
 * keynameNum = 909（与管线配置一致）
 *
 * 目标：提取这些数组的值，特别是：
 * 1. bytecode (_$iH._$eT)
 * 2. 常量池 (_$iH._$cV)
 * 3. 字符串表 (_$ap / _$f7)
 * 4. 加密密钥相关数组
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs'), path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('=== 提取 send hook VM 配置对象 ===\n');

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

  // 首次加载 + reload
  console.log('[1] 加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('[2] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);

  // 获取 send 函数的 Scopes
  console.log('\n[3] 获取 send 函数 Scopes...');
  var sendEval = await client.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
    objectGroup: 'sendFn',
  });
  
  var sendObjectId = sendEval.result.objectId;
  var props = await client.send('Runtime.getProperties', {
    objectId: sendObjectId,
    ownProperties: true,
  });
  
  // 找到 [[Scopes]]
  var scopesObjectId = null;
  for (var ip of props.internalProperties) {
    if (ip.name === '[[Scopes]]' && ip.value && ip.value.objectId) {
      scopesObjectId = ip.value.objectId;
      break;
    }
  }
  
  if (!scopesObjectId) {
    console.log('FATAL: No Scopes found');
    process.exit(1);
  }

  // 获取 Scopes 列表
  var scopeList = await client.send('Runtime.getProperties', {
    objectId: scopesObjectId,
    ownProperties: true,
  });

  // 遍历每个 Scope，提取数组数据
  var extractedData = {};
  
  for (var si = 0; si < scopeList.result.length; si++) {
    var scope = scopeList.result[si];
    console.log('\n[Scope ' + si + ']');
    
    if (!scope.value || !scope.value.objectId) continue;
    
    var scopeVars = await client.send('Runtime.getProperties', {
      objectId: scope.value.objectId,
      ownProperties: true,
    });
    
    for (var vi = 0; vi < scopeVars.result.length; vi++) {
      var v = scopeVars.result[vi];
      if (!v.value) continue;
      
      var varName = v.name;
      var varType = v.value.type;
      var varDesc = v.value.description || '';
      
      // 只关注数组和重要对象
      if (varType === 'object' && varDesc.indexOf('Array') >= 0) {
        // 提取数组长度
        var lenMatch = varDesc.match(/Array\((\d+)\)/);
        var arrLen = lenMatch ? parseInt(lenMatch[1]) : 0;
        console.log('  ' + varName + ': Array(' + arrLen + ')');
        
        if (arrLen > 0 && arrLen < 2000) {
          // 提取数组内容
          if (v.value.objectId) {
            try {
              var arrProps = await client.send('Runtime.getProperties', {
                objectId: v.value.objectId,
                ownProperties: true,
              });
              
              var arrData = [];
              for (var ai = 0; ai < Math.min(arrProps.result.length, arrLen); ai++) {
                var elem = arrProps.result[ai];
                if (elem.value) {
                  if (elem.value.type === 'number') {
                    arrData.push(elem.value.value);
                  } else if (elem.value.type === 'string') {
                    arrData.push(elem.value.value);
                  } else if (elem.value.type === 'undefined') {
                    arrData.push(undefined);
                  } else if (elem.value.type === 'object') {
                    arrData.push('[obj:' + (elem.value.description || '').substring(0, 30) + ']');
                  } else {
                    arrData.push('[' + elem.value.type + ']');
                  }
                } else {
                  arrData.push(undefined);
                }
              }
              
              extractedData[varName] = {
                scope: si,
                length: arrLen,
                data: arrData,
              };
              
              // 如果是字符串数组，打印前 20 个
              var sample = arrData.slice(0, 20).map(function(x) {
                return typeof x === 'string' ? '"' + x.substring(0, 30) + '"' : String(x);
              });
              console.log('    first 20:', sample.join(', '));
            } catch(e) {
              console.log('    Error extracting:', e.message);
            }
          }
        }
      } else if (varType === 'function') {
        // 只记录函数名
        console.log('  ' + varName + ': function');
      } else if (varType === 'object') {
        console.log('  ' + varName + ': object (' + varDesc.substring(0, 40) + ')');
      }
    }
  }

  // 保存提取的数据
  console.log('\n[4] 保存提取的数据...');
  
  var result = {
    timestamp: new Date().toISOString(),
    arrays: {},
  };
  
  Object.keys(extractedData).forEach(function(key) {
    var d = extractedData[key];
    // 只保存长度 < 500 的数组完整数据
    if (d.length <= 500) {
      result.arrays[key] = d;
    } else {
      // 大数组只保存前 100 个元素
      result.arrays[key] = {
        scope: d.scope,
        length: d.length,
        data: d.data.slice(0, 100),
        truncated: true,
      };
    }
  });
  
  fs.writeFileSync(
    path.join(__dirname, 'output/capture-20080/send-hook-arrays.json'),
    JSON.stringify(result, null, 2)
  );
  console.log('  Saved to output/capture-20080/send-hook-arrays.json');
  
  // 特别分析：查找加密密钥候选
  console.log('\n[5] 查找加密密钥候选...');
  Object.keys(extractedData).forEach(function(key) {
    var d = extractedData[key];
    // 查找 16/17/32/48 字节的数字数组
    if (d.length >= 16 && d.length <= 48 && d.data.every(function(x) { return typeof x === 'number'; })) {
      console.log('\n  ★ ' + key + ' (Array(' + d.length + ')):');
      console.log('    data:', JSON.stringify(d.data));
      console.log('    hex:', d.data.map(function(x) { return (x & 0xFF).toString(16).padStart(2, '0'); }).join(' '));
    }
  });
  
  // 查找字符串表中的关键字符串
  console.log('\n[6] 查找关键字符串...');
  Object.keys(extractedData).forEach(function(key) {
    var d = extractedData[key];
    if (d.data && d.data.length > 10) {
      var strings = d.data.filter(function(x) { return typeof x === 'string'; });
      if (strings.length > 5) {
        // 查找加密相关字符串
        var cryptoStrings = strings.filter(function(s) {
          return s.match(/encrypt|decrypt|AES|CBC|key|cipher|hash|hmac|sign|query|param/i);
        });
        if (cryptoStrings.length > 0) {
          console.log('\n  ' + key + ' crypto strings:', cryptoStrings);
        }
        
        // 查找 query 参数名
        var queryStrings = strings.filter(function(s) {
          return s.match(/r20SZOQm|query|param/i);
        });
        if (queryStrings.length > 0) {
          console.log('  ' + key + ' query strings:', queryStrings);
        }
        
        // 查找 send/open/fetch
        var hookStrings = strings.filter(function(s) {
          return s.match(/^(send|open|fetch|XMLHttpRequest)$/i);
        });
        if (hookStrings.length > 0) {
          console.log('  ' + key + ' hook strings:', hookStrings);
        }
      }
    }
  });

  console.log('\n=== 完成 ===');
  console.log('提取的数组数量:', Object.keys(extractedData).length);
  console.log('数组名:', Object.keys(extractedData).join(', '));

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
