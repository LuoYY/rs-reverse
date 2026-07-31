/**
 * 10_cdp_sm4_hunt.js
 * 
 * 在浏览器中实时搜索 SM4 加密证据：
 * 1. 搜索闭包中的 SM4 S-Box（首元素 214）
 * 2. 搜索 SM4 fk/ck 常量
 * 3. 在 query 生成时 hook 所有 16 字节数组操作
 * 4. 提取 SM4 密钥
 * 5. 用提取的密钥离线解密 query
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function evalCDP(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text };
  return r.result.value;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  
  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  const queries = [];
  cdp.on('Network.requestWillBeSent', p => {
    if (p.request.url.includes('r20SZOQm=')) {
      const m = p.request.url.match(/r20SZOQm=([^&]+)/);
      queries.push({ method: p.request.method, url: p.request.url.substring(0, 100), query: m?.[1] });
    }
  });
  
  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  // 验证
  const test = await evalCDP(cdp, `(function(){ var x=new XMLHttpRequest(); x.open('GET','/px-gateway/GatewayConfig/security',false); x.send(); return x.status + ' ' + (x.responseURL||'').includes('r20SZOQm='); })()`);
  console.log('[3] 验证:', test);
  
  // [4] 在浏览器中搜索 SM4 常量
  console.log('\n[4] 搜索 SM4 常量...');
  
  const sm4Search = await evalCDP(cdp, `(function(){
    var results = {};
    
    // SM4 S-Box 首行
    var sm4_sbox_row0 = [214,144,233,254,204,225,61,183,22,182,20,194,40,251,44,5];
    // SM4 fk
    var sm4_fk = [2746333894, 1453994832, 1736282519, 2993693404];
    // SM4 ck 前 4 个
    var sm4_ck0 = 462357;
    
    // 搜索 send hook 的闭包
    var send = XMLHttpRequest.prototype.send;
    var src = Function.prototype.toString.call(send);
    
    // 获取 send 的 [[Scopes]]
    // 不能直接访问，但可以通过间接方式搜索
    
    // 方法：遍历 window 上所有对象，搜索 SM4 S-Box
    var found = [];
    
    // 搜索 $_ts（如果存在）
    if (typeof $_ts !== 'undefined') {
      results.tsKeys = Object.keys($_ts).length;
      // 搜索 $_ts 中的数组
      for (var k in $_ts) {
        var v = $_ts[k];
        if (Array.isArray(v) && v.length === 256) {
          if (v[0] === 214 && v[1] === 144) {
            found.push({loc: '$_ts.' + k, type: 'SM4_SBOX', len: v.length});
          }
        }
        if (Array.isArray(v) && v.length === 4) {
          if (v[0] === 2746333894 || (v[0] >>> 0) === 2746333894) {
            found.push({loc: '$_ts.' + k, type: 'SM4_FK', val: JSON.stringify(v)});
          }
        }
      }
    }
    
    results.found = found;
    results.srcLen = src.length;
    results.srcHas214 = src.indexOf('214') >= 0;
    results.srcHas2746 = src.indexOf('2746333894') >= 0 || src.indexOf('A3B1BAC6') >= 0;
    
    return JSON.stringify(results);
  })()`);
  console.log('  SM4 搜索:', sm4Search);
  
  // [5] 深度搜索：通过 CDP getProperties 遍历闭包
  console.log('\n[5] 深度闭包搜索...');
  
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  
  let scopesId = null;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  
  if (!scopesId) { console.log('  ❌ 无 Scopes'); await browser.close(); return; }
  
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  const sm4Findings = [];
  const allSmallArrays = []; // 16-48 字节的数组
  
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      
      // 搜索数组
      if (v.value.type === 'object' && v.value.subtype === 'array') {
        const lenResult = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return this.length; }',
          returnByValue: true,
        });
        const len = lenResult.result.value;
        
        // 检查 256 元素数组（可能是 S-Box）
        if (len === 256) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(this.slice(0, 16)); }',
            returnByValue: true,
          });
          const first16 = JSON.parse(data.result.value);
          if (first16[0] === 214 && first16[1] === 144) {
            console.log(`  ★★★ 找到 SM4 S-Box! ${scope.name}/${v.name}[256]`);
            sm4Findings.push({ type: 'S-Box', scope: scope.name, name: v.name, objectId: v.value.objectId });
            
            // 提取完整 S-Box
            const fullData = await cdp.send('Runtime.callFunctionOn', {
              objectId: v.value.objectId,
              functionDeclaration: 'function() { return JSON.stringify(this); }',
              returnByValue: true,
            });
            fs.writeFileSync(path.join(OUT, 'sm4_sbox.json'), fullData.result.value);
            console.log('  S-Box 已保存');
          } else {
            console.log(`  256 元素数组 ${scope.name}/${v.name}: [${first16.slice(0,4).join(',')}] (非 SM4 S-Box)`);
          }
        }
        
        // 检查 32 元素数组（可能是 SM4 ck）
        if (len === 32) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(this); }',
            returnByValue: true,
          });
          const arr = JSON.parse(data.result.value);
          if (arr[0] === 462357) {
            console.log(`  ★★★ 找到 SM4 CK! ${scope.name}/${v.name}[32]`);
            sm4Findings.push({ type: 'CK', scope: scope.name, name: v.name });
          }
        }
        
        // 检查 4 元素数组（可能是 SM4 fk 或密钥）
        if (len === 4) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(Array.from(this).map(function(x){return typeof x === "number" ? x : typeof x;})); }',
            returnByValue: true,
          });
          const arr = JSON.parse(data.result.value);
          if (typeof arr[0] === 'number' && (arr[0] === 2746333894 || (arr[0] >>> 0) === 2746333894)) {
            console.log(`  ★★★ 找到 SM4 FK! ${scope.name}/${v.name}[4]`);
            sm4Findings.push({ type: 'FK', scope: scope.name, name: v.name });
          }
          if (arr.every(x => typeof x === 'number')) {
            console.log(`  4 元素数组 ${scope.name}/${v.name}: [${arr.join(',')}]`);
          }
        }
        
        // 收集 16 字节数组（可能是 SM4 密钥）
        if (len === 16) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(Array.from(this).map(function(x){return typeof x === "number" ? x : typeof x;})); }',
            returnByValue: true,
          });
          const arr = JSON.parse(data.result.value);
          if (arr.every(x => typeof x === 'number' && x >= 0 && x <= 255)) {
            allSmallArrays.push({ scope: scope.name, name: v.name, data: arr });
            console.log(`  16B 数组 ${scope.name}/${v.name}: [${arr.join(',')}]`);
          }
        }
      }
      
      // 搜索对象中的 SM4 常量
      if (v.value.type === 'object' && v.value.className === 'Object') {
        const objVars = await cdp.send('Runtime.getProperties', { objectId: v.value.objectId, ownProperties: true });
        for (const p of objVars.result) {
          if (p.value?.type === 'number') {
            // 搜索 SM4 fk 值
            if (p.value.value === 2746333894 || p.value.value === 462357) {
              console.log(`  ★ SM4 常量 ${v.name}.${p.name} = ${p.value.value}`);
              sm4Findings.push({ type: 'const', name: `${v.name}.${p.name}`, value: p.value.value });
            }
          }
          // 搜索嵌套数组
          if (p.value?.type === 'object' && p.value?.subtype === 'array' && p.value?.objectId) {
            const arrLen = await cdp.send('Runtime.callFunctionOn', {
              objectId: p.value.objectId,
              functionDeclaration: 'function() { return this.length; }',
              returnByValue: true,
            });
            if (arrLen.result.value === 256) {
              const first4 = await cdp.send('Runtime.callFunctionOn', {
                objectId: p.value.objectId,
                functionDeclaration: 'function() { return JSON.stringify(this.slice(0, 4)); }',
                returnByValue: true,
              });
              const f4 = JSON.parse(first4.result.value);
              if (f4[0] === 214) {
                console.log(`  ★★★ SM4 S-Box 在对象中! ${v.name}.${p.name}[256]`);
                sm4Findings.push({ type: 'S-Box-obj', name: `${v.name}.${p.name}`, objectId: p.value.objectId });
              }
            }
            if (arrLen.result.value === 16) {
              const data = await cdp.send('Runtime.callFunctionOn', {
                objectId: p.value.objectId,
                functionDeclaration: 'function() { return JSON.stringify(Array.from(this).map(function(x){return typeof x === "number" ? x : typeof x;})); }',
                returnByValue: true,
              });
              const arr = JSON.parse(data.result.value);
              if (arr.every(x => typeof x === 'number' && x >= 0 && x <= 255)) {
                allSmallArrays.push({ scope: scope.name, name: `${v.name}.${p.name}`, data: arr });
                console.log(`  16B 数组 ${v.name}.${p.name}: [${arr.join(',')}]`);
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`\n  SM4 发现: ${sm4Findings.length} 个`);
  console.log(`  16B 数组: ${allSmallArrays.length} 个`);
  
  // [6] 触发 POST 并捕获 query
  console.log('\n[6] 触发 POST...');
  const postRes = await evalCDP(cdp, `(function(){
    var x = new XMLHttpRequest();
    x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
    x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    x.send('{}');
    return x.status + ' ' + (x.responseURL || '').substring(0, 120);
  })()`);
  console.log('  POST:', postRes);
  await page.waitForTimeout(1000);
  
  // [7] 搜索动态代码中的 SM4 常量
  console.log('\n[7] 搜索动态代码中的 SM4 常量...');
  const dynCodeSearch = await evalCDP(cdp, `(function(){
    // 搜索所有 script 标签
    var scripts = document.querySelectorAll('script');
    var results = [];
    for (var i = 0; i < scripts.length; i++) {
      var text = scripts[i].textContent || '';
      if (text.length > 10000) {
        var has214 = text.indexOf('214') >= 0;
        var hasSM4fk = text.indexOf('2746333894') >= 0 || text.indexOf('A3B1BAC6') >= 0 || text.indexOf('a3b1bac6') >= 0;
        var hasSM4ck = text.indexOf('462357') >= 0;
        if (has214 || hasSM4fk || hasSM4ck) {
          results.push({idx: i, len: text.length, has214: has214, hasSM4fk: hasSM4fk, hasSM4ck: hasSM4ck});
        }
      }
    }
    return JSON.stringify(results);
  })()`);
  console.log('  动态代码搜索:', dynCodeSearch);
  
  // [8] 保存结果
  console.log(`\n[8] 捕获 ${queries.length} 个 query`);
  
  const output = {
    timestamp: new Date().toISOString(),
    sm4Findings,
    allSmallArrays,
    queries,
  };
  
  const outFile = path.join(OUT, `sm4_hunt_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`  保存: ${outFile}`);
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
