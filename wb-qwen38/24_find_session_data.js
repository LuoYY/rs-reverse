/**
 * 24_find_session_data.js
 * 
 * 在闭包中搜索 session_data 的存储位置
 * 然后尝试用闭包中的所有 16B 数组作为 key 解密 session_data
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';

function string2numarr(str) {
  const keys = basestr.split('');
  const lookup = {};
  keys.forEach((ch, idx) => { lookup[ch] = idx; });
  const ans = [];
  for (let i = 0; i < str.length; i += 4) {
    const c0 = lookup[str[i]], c1 = lookup[str[i+1]], c2 = lookup[str[i+2]], c3 = lookup[str[i+3]];
    if (c0 !== undefined && c1 !== undefined) ans.push((c0 << 2) | (c1 >> 4));
    if (c1 !== undefined && c2 !== undefined) ans.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c2 !== undefined && c3 !== undefined) ans.push(((c2 & 3) << 6) | c3);
  }
  return ans;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  
  console.log('[1] 加载...');
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  // 验证并获取 query
  const testRes = await cdp.send('Runtime.evaluate', {
    expression: `(function(){var x=new XMLHttpRequest();x.open('GET','/px-gateway/GatewayConfig/security',false);x.send();return x.responseURL||''})()`,
    returnByValue: true,
  });
  const testUrl = testRes.result.value;
  const qMatch = testUrl.match(/r20SZOQm=([^&]+)/);
  if (!qMatch) { console.log('❌ 无 query'); await browser.close(); return; }
  
  const qBytes = string2numarr(qMatch[1].substring(1));
  const sessionData = qBytes.slice(7, 55);
  console.log('[2] session_data:', JSON.stringify(sessionData));
  
  // 获取 global 数组
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  
  const dSrcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32[1];
  
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId;
    }
  }
  
  console.log('[3] Global 数组已定位');
  
  // [4] 在 global 数组中搜索 session_data
  console.log('\n[4] 搜索 session_data 存储位置...');
  
  const searchResult = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var target = ${JSON.stringify(sessionData)};
      var results = [];
      
      // 搜索 global 数组中的每个元素
      for (var i = 0; i < this.length; i++) {
        var item = this[i];
        if (!item) continue;
        
        // 检查是否是数组且包含 session_data
        if (Array.isArray(item) || (typeof item === 'object' && item.length !== undefined)) {
          try {
            var arr = Array.from(item);
            // 搜索完整匹配
            if (arr.length >= 48) {
              for (var j = 0; j <= arr.length - 48; j++) {
                var match = true;
                for (var k = 0; k < 48; k++) {
                  if (arr[j + k] !== target[k]) { match = false; break; }
                }
                if (match) {
                  results.push({loc: 'global[' + i + '][' + j + '..' + (j+47) + ']', arrLen: arr.length});
                }
              }
            }
            // 也搜索前 8 字节匹配
            if (arr.length >= 8) {
              for (var j = 0; j <= arr.length - 8; j++) {
                var match8 = true;
                for (var k = 0; k < 8; k++) {
                  if (arr[j + k] !== target[k]) { match8 = false; break; }
                }
                if (match8) {
                  results.push({loc: 'global[' + i + '][' + j + '..] (8B match)', arrLen: arr.length, 
                    preview: arr.slice(j, j + 20)});
                }
              }
            }
          } catch(e) {}
        }
        
        // 检查对象的属性
        if (typeof item === 'object' && !Array.isArray(item)) {
          try {
            var keys = Object.keys(item);
            for (var ki = 0; ki < keys.length; ki++) {
              var prop = item[keys[ki]];
              if (Array.isArray(prop) && prop.length >= 8) {
                var match8 = true;
                for (var k = 0; k < 8; k++) {
                  if (prop[k] !== target[k]) { match8 = false; break; }
                }
                if (match8) {
                  results.push({loc: 'global[' + i + '].' + keys[ki] + ' (8B match)', 
                    arrLen: prop.length, preview: Array.from(prop).slice(0, 20)});
                }
              }
            }
          } catch(e) {}
        }
      }
      
      return JSON.stringify(results);
    }`,
    returnByValue: true,
  });
  
  const found = JSON.parse(searchResult.result.value);
  console.log(`  找到 ${found.length} 个匹配:`);
  for (const f of found) {
    console.log(`  ${f.loc} (arr len=${f.arrLen})`);
    if (f.preview) console.log(`    preview: [${f.preview.join(',')}]`);
  }
  
  // [5] 也在 send hook 的闭包中搜索
  console.log('\n[5] 搜索 send 闭包...');
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      if (v.value.type !== 'object') continue;
      
      // 检查数组
      if (v.value.subtype === 'array') {
        const checkR = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: `function() {
            var target = ${JSON.stringify(sessionData.slice(0, 8))};
            if (!this.length || this.length < 8) return null;
            var arr = Array.from(this);
            for (var j = 0; j <= arr.length - 8; j++) {
              var match = true;
              for (var k = 0; k < 8; k++) {
                if (arr[j + k] !== target[k]) { match = false; break; }
              }
              if (match) return JSON.stringify({loc: '${scope.name}/${v.name}[' + j + ']', arrLen: arr.length, preview: arr.slice(j, j + 20)});
            }
            return null;
          }`,
          returnByValue: true,
        });
        if (checkR.result.value) {
          console.log(`  ★ ${JSON.parse(checkR.result.value).loc}: ${JSON.stringify(JSON.parse(checkR.result.value).preview)}`);
        }
      }
      
      // 检查对象属性
      if (v.value.className === 'Object' || !v.value.subtype) {
        const objVars = await cdp.send('Runtime.getProperties', { objectId: v.value.objectId, ownProperties: true });
        for (const ov of objVars.result) {
          if (ov.value?.type === 'object' && ov.value?.subtype === 'array' && ov.value?.objectId) {
            const checkR2 = await cdp.send('Runtime.callFunctionOn', {
              objectId: ov.value.objectId,
              functionDeclaration: `function() {
                var target = ${JSON.stringify(sessionData.slice(0, 8))};
                if (!this.length || this.length < 8) return null;
                var arr = Array.from(this);
                for (var j = 0; j <= arr.length - 8; j++) {
                  var match = true;
                  for (var k = 0; k < 8; k++) {
                    if (arr[j + k] !== target[k]) { match = false; break; }
                  }
                  if (match) return JSON.stringify({preview: arr.slice(j, j + 20)});
                }
                return null;
              }`,
              returnByValue: true,
            });
            if (checkR2.result.value) {
              console.log(`  ★ ${scope.name}/${v.name}.${ov.name}: ${checkR2.result.value}`);
            }
          }
        }
      }
    }
  }
  
  // [6] 提取所有 16B 数组并尝试解密 session_data
  console.log('\n[6] 暴力解密 session_data...');
  
  // 收集所有 16B 数组
  const allKeys = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var keys = [];
      for (var i = 0; i < this.length; i++) {
        var item = this[i];
        if (Array.isArray(item) && item.length === 16 && item.every(function(x) { return typeof x === 'number' && x >= 0 && x <= 255; })) {
          keys.push({idx: i, key: Array.from(item)});
        }
        // 也检查对象属性
        if (typeof item === 'object' && item && !Array.isArray(item)) {
          var ks = Object.keys(item);
          for (var j = 0; j < ks.length; j++) {
            var prop = item[ks[j]];
            if (Array.isArray(prop) && prop.length === 16 && prop.every(function(x) { return typeof x === 'number' && x >= 0 && x <= 255; })) {
              keys.push({idx: i + '.' + ks[j], key: Array.from(prop)});
            }
          }
        }
      }
      return JSON.stringify(keys);
    }`,
    returnByValue: true,
  });
  
  const keysList = JSON.parse(allKeys.result.value);
  console.log(`  找到 ${keysList.length} 个 16B 数组`);
  
  // 用 Node.js crypto 尝试解密
  const crypto = require('crypto');
  for (const kc of keysList) {
    for (const mode of ['aes-128-ecb', 'aes-128-cbc']) {
      try {
        const iv = mode.includes('cbc') ? Buffer.alloc(16, 0) : null;
        const d = crypto.createDecipheriv(mode, Buffer.from(kc.key), iv);
        d.setAutoPadding(false);
        const raw = [...Buffer.concat([d.update(Buffer.from(sessionData)), d.final()])];
        const lastB = raw[raw.length - 1];
        const padOk = lastB >= 1 && lastB <= 16 && raw.slice(-lastB).every(b => b === lastB);
        if (padOk) {
          const pt = raw.slice(0, raw.length - lastB);
          const ascii = pt.filter(b => b >= 32 && b < 127).length;
          console.log(`  ★ global[${kc.idx}] ${mode}: padding=${lastB} ✅ ${pt.length}B ASCII=${(ascii/pt.length*100).toFixed(0)}% [${pt.slice(0, 20).join(',')}]`);
        }
      } catch(e) {}
    }
  }
  
  // 也试 21B 数组（numarrAddTime 格式）
  const all21Keys = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var keys = [];
      for (var i = 0; i < this.length; i++) {
        var item = this[i];
        if (Array.isArray(item) && (item.length === 21 || item.length === 17) && item.every(function(x) { return typeof x === 'number' && x >= 0 && x <= 255; })) {
          keys.push({idx: i, key: Array.from(item), len: item.length});
        }
      }
      return JSON.stringify(keys);
    }`,
    returnByValue: true,
  });
  
  const keys21List = JSON.parse(all21Keys.result.value);
  console.log(`  找到 ${keys21List.length} 个 17/21B 数组`);
  
  // 用管线 encryptMode2 解密
  require('module-alias')(path.join(__dirname, '..'));
  const gv = require('@src/handler/globalVarible');
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  
  for (const kc of keys21List) {
    for (const flag of [0, 1]) {
      try {
        const pt = encryptMode2([...sessionData], [...kc.key], flag);
        if (pt.length > 0) {
          const ascii = pt.filter(b => b >= 32 && b < 127).length;
          const ratio = (ascii / pt.length * 100).toFixed(0);
          const lastB = pt[pt.length - 1];
          const padOk = lastB >= 1 && lastB <= 16;
          if (padOk || ratio > 60) {
            console.log(`  ★ global[${kc.idx}](${kc.len}B) flag=${flag}: ${pt.length}B ASCII=${ratio}% pad=${padOk ? '✅' : '❌'} [${pt.slice(0, 20).join(',')}]`);
          }
        }
      } catch(e) {}
    }
  }
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
