/**
 * 07_extract_bytecode.js
 * 
 * 聚焦提取：
 * 1. send hook 的 VM bytecode（_$fb._$iH）
 * 2. VM dispatcher 函数源码
 * 3. 常量池完整内容
 * 4. 触发 POST 并捕获 query + 中间值
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
  
  // 收集 query
  const queries = [];
  await cdp.send('Network.enable');
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
  
  // [4] 提取 send hook 完整信息
  console.log('\n[4] 提取 send hook...');
  const hookInfo = await evalCDP(cdp, `(function(){
    var send = XMLHttpRequest.prototype.send;
    var src = Function.prototype.toString.call(send);
    
    // 从源码中提取变量名
    // 格式: function _$XX(){...if(_$YY._$ZZ)..._$DD(_$YY,0,_$YY._$HH.length,_$AA)...}
    var configMatch = src.match(/if\\(([_$\\w]+)\\.([_$\\w]+)\\)/);
    var dispatchMatch = src.match(/([_$\\w]+)\\(([_$\\w]+),0,([_$\\w]+)\\.([_$\\w]+)\\.length,([_$\\w]+)\\)/);
    
    return JSON.stringify({
      source: src,
      configVar: configMatch ? configMatch[1] : null,
      cacheFlag: configMatch ? configMatch[2] : null,
      dispatcherFn: dispatchMatch ? dispatchMatch[1] : null,
      configObj: dispatchMatch ? dispatchMatch[2] : null,
      bytecodeProp: dispatchMatch ? dispatchMatch[4] : null,
    });
  })()`);
  
  const hi = JSON.parse(hookInfo);
  console.log('  源码长度:', hi.source.length);
  console.log('  配置变量:', hi.configVar);
  console.log('  缓存标志:', hi.cacheFlag);
  console.log('  Dispatcher:', hi.dispatcherFn);
  console.log('  Bytecode 属性:', hi.bytecodeProp);
  
  // [5] 提取 VM 配置对象的完整内容
  console.log('\n[5] 提取 VM 配置...');
  const vmConfig = await evalCDP(cdp, `(function(){
    var send = XMLHttpRequest.prototype.send;
    var src = Function.prototype.toString.call(send);
    
    // 提取配置变量名
    var m = src.match(/if\\(([_$\\w]+)\\.([_$\\w]+)\\)/);
    if (!m) return JSON.stringify({error: 'no config match'});
    var configName = m[1];
    
    // 通过 eval 获取配置对象（它在闭包中，但我们可以用间接方式）
    // 方法：创建一个函数，在 send 的上下文中执行
    // 不行，闭包变量不能从外部访问
    
    // 替代方法：从 [[Scopes]] 提取
    return JSON.stringify({configName: configName, note: 'need CDP getProperties'});
  })()`);
  console.log('  VM config:', vmConfig);
  
  // 用 CDP 直接提取
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  
  let scopesId = null;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  
  if (!scopesId) { console.log('  ❌ 无 Scopes'); await browser.close(); return; }
  
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  // 遍历 scope 找到配置对象和 bytecode
  const result = { bytecode: null, constants: null, basestr: null, stringTables: {}, smallArrays: {}, dispatcherSource: null };
  
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      
      // 检查是否是 VM 配置对象（有 bytecode 属性的对象）
      if (v.value.type === 'object' && v.value.className === 'Object') {
        const objVars = await cdp.send('Runtime.getProperties', { objectId: v.value.objectId, ownProperties: true });
        const propMap = {};
        for (const p of objVars.result) {
          propMap[p.name] = p.value;
        }
        
        // 检查是否有 bytecode 数组属性
        for (const [pn, pv] of Object.entries(propMap)) {
          if (pv?.type === 'object' && pv?.subtype === 'array' && pv?.objectId) {
            const arrLen = await evalCDP(cdp, `(function(){ var arr; /* need objectId */ return -1; })()`);
            // 用 callFunctionOn 获取长度
            const lenResult = await cdp.send('Runtime.callFunctionOn', {
              objectId: pv.objectId,
              functionDeclaration: 'function() { return this.length; }',
              returnByValue: true,
            });
            const len = lenResult.result.value;
            
            if (len > 10 && len < 200) {
              // 可能是 bytecode！提取完整内容
              const dataResult = await cdp.send('Runtime.callFunctionOn', {
                objectId: pv.objectId,
                functionDeclaration: 'function() { return JSON.stringify(Array.from(this).map(function(x) { return typeof x === "function" ? "FN" : x; })); }',
                returnByValue: true,
              });
              if (dataResult.result.value) {
                const data = JSON.parse(dataResult.result.value);
                const numCount = data.filter(x => typeof x === 'number').length;
                const strCount = data.filter(x => typeof x === 'string').length;
                const fnCount = data.filter(x => x === 'FN').length;
                console.log(`  ★ ${v.name}.${pn}: [${len}] num=${numCount} str=${strCount} fn=${fnCount}`);
                console.log(`    前 30: [${data.slice(0, 30).join(',')}]`);
                
                if (len >= 50 && len <= 150 && numCount > len * 0.5) {
                  result.bytecode = { name: `${v.name}.${pn}`, length: len, data };
                  console.log(`    → 识别为 BYTECODE!`);
                }
              }
            }
          }
          
          // 检查数字属性（scope size, cache flag）
          if (pv?.type === 'number') {
            console.log(`  ${v.name}.${pn} = ${pv.value}`);
          }
          if (pv?.type === 'boolean') {
            console.log(`  ${v.name}.${pn} = ${pv.value}`);
          }
        }
      }
      
      // 提取数组
      if (v.value.type === 'object' && v.value.subtype === 'array') {
        const lenResult = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return this.length; }',
          returnByValue: true,
        });
        const len = lenResult.result.value;
        
        // 86 = basestr
        if (len === 86) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(this); }',
            returnByValue: true,
          });
          result.basestr = JSON.parse(data.result.value);
          console.log(`  basestr[${len}]: "${result.basestr.join('').substring(0, 40)}..."`);
        }
        
        // 209 = 常量池
        if (len === 209) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(this); }',
            returnByValue: true,
          });
          result.constants = JSON.parse(data.result.value);
          console.log(`  常量池[${len}]: [${result.constants.slice(0, 15).join(',')}]`);
        }
        
        // 4 = 小数组（可能是关键参数）
        if (len === 4) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(Array.from(this).map(function(x) { return typeof x === "function" ? "FN" : typeof x === "object" ? "OBJ" : x; })); }',
            returnByValue: true,
          });
          result.smallArrays[v.name] = JSON.parse(data.result.value);
          console.log(`  小数组 ${v.name}[4]: [${JSON.stringify(result.smallArrays[v.name])}]`);
        }
        
        // 96 = 字符串表
        if (len === 96) {
          const data = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: 'function() { return JSON.stringify(this.slice(0, 20)); }',
            returnByValue: true,
          });
          result.stringTables[v.name] = JSON.parse(data.result.value);
        }
      }
      
      // 提取 dispatcher 函数源码
      if (v.value.type === 'function' && v.name === hi.dispatcherFn) {
        const srcResult = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return Function.prototype.toString.call(this).substring(0, 3000); }',
          returnByValue: true,
        });
        result.dispatcherSource = srcResult.result.value;
        console.log(`\n  Dispatcher ${v.name} 源码 (${result.dispatcherSource.length} chars):`);
        console.log(`    ${result.dispatcherSource.substring(0, 300)}...`);
      }
    }
  }
  
  // [6] 触发 POST 并捕获 query
  console.log('\n[6] 触发 POST...');
  const postRes = await evalCDP(cdp, `(function(){
    var x = new XMLHttpRequest();
    x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
    x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    x.send('{}');
    return x.status + ' ' + (x.responseURL || '');
  })()`);
  console.log('  POST:', postRes);
  
  await page.waitForTimeout(1000);
  
  console.log(`\n[7] 捕获 ${queries.length} 个 query:`);
  for (const q of queries) {
    console.log(`  ${q.method} ${q.url}`);
    if (q.query) console.log(`    query: ${q.query}`);
  }
  
  // 保存
  result.queries = queries;
  result.hookSource = hi.source;
  const outFile = path.join(OUT, `bytecode_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\n[8] 保存: ${outFile}`);
  
  await browser.close();
  console.log('=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
