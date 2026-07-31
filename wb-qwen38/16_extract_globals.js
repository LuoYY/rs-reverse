/**
 * 16_extract_globals.js
 * 
 * 精确定位 query 生成函数：
 * bytecode PC 74: global[21][global[65][5]](this, arguments)
 * 
 * 需要找到 dispatcher 闭包中的 _$gx（global 数组）
 * 然后提取 _$gx[21] 和 _$gx[65]
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
  if (r.exceptionDetails) return { __error: r.exceptionDetails.exception?.description?.substring(0, 200) || r.exceptionDetails.text };
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
  
  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  const test = await evalCDP(cdp, `(function(){ var x=new XMLHttpRequest(); x.open('GET','/px-gateway/GatewayConfig/security',false); x.send(); return x.status; })()`);
  console.log('[3] 验证:', test);
  
  // [4] 获取 dispatcher 的闭包
  console.log('\n[4] 获取 dispatcher 闭包...');
  
  // 先获取 send 的闭包，找到 dispatcher 函数
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  
  let scopesId = null;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  // 找到 dispatcher 函数
  let dispatcherId = null;
  const sendSrc = await evalCDP(cdp, `Function.prototype.toString.call(XMLHttpRequest.prototype.send)`);
  const dispatchMatch = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dispatcherName = dispatchMatch?.[1];
  console.log('  Dispatcher 名:', dispatcherName);
  
  // 在 scope 1 中找到 dispatcher
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === dispatcherName && v.value?.type === 'function') {
        dispatcherId = v.value.objectId;
        console.log(`  找到 dispatcher: ${scope.name}/${v.name}`);
      }
    }
  }
  
  if (!dispatcherId) {
    console.log('  ❌ 未找到 dispatcher');
    await browser.close();
    return;
  }
  
  // [5] 获取 dispatcher 的闭包（包含 _$gx, _$l3 等）
  console.log('\n[5] 提取 dispatcher 闭包变量...');
  
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dispatcherId, ownProperties: true });
  let dispScopesId = null;
  for (const ip of (dispProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId;
  }
  
  if (!dispScopesId) {
    console.log('  ❌ dispatcher 无 [[Scopes]]');
    await browser.close();
    return;
  }
  
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  console.log(`  Dispatcher scope 层数: ${dispScopes.result.length}`);
  
  // 遍历 dispatcher 的闭包，找所有数组
  const globalCandidates = [];
  
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (!v.value) continue;
      
      // 搜索数组（_$gx 可能是 20-100 个元素的数组）
      if (v.value.type === 'object' && v.value.subtype === 'array' && v.value.objectId) {
        const lenR = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return this.length; }',
          returnByValue: true,
        });
        const len = lenR.result.value;
        
        // 检查索引 21 和 65 是否存在
        if (len > 65) {
          const check = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: `function() {
              var t21 = typeof this[21];
              var t65 = typeof this[65];
              var t65_5 = this[65] ? typeof this[65][5] : 'N/A';
              return JSON.stringify({len: this.length, t21: t21, t65: t65, t65_5: t65_5});
            }`,
            returnByValue: true,
          });
          const info = JSON.parse(check.result.value);
          console.log(`  ${scope.name}/${v.name}[${len}]: [21]=${info.t21}, [65]=${info.t65}, [65][5]=${info.t65_5}`);
          
          if (info.t21 === 'object' && info.t65 === 'object') {
            globalCandidates.push({ scope: scope.name, name: v.name, len, objectId: v.value.objectId, info });
          }
        }
      }
      
      // 也打印非数组变量（可能是对象）
      if (v.value.type === 'object' && !v.value.subtype && v.value.objectId && v.value.className === 'Object') {
        const propR = await cdp.send('Runtime.getProperties', { objectId: v.value.objectId, ownProperties: true });
        const propNames = propR.result.map(p => p.name).filter(n => n !== '__proto__');
        if (propNames.length > 0 && propNames.length < 30) {
          // 检查是否有数字索引（可能是数组-like 对象）
          const hasNumericKeys = propNames.some(n => /^\d+$/.test(n));
          if (hasNumericKeys) {
            console.log(`  ${scope.name}/${v.name} (Object): keys=[${propNames.slice(0, 10).join(',')}]`);
          }
        }
      }
    }
  }
  
  // [6] 深入分析 global 候选
  console.log('\n[6] 分析 global 候选...');
  
  for (const gc of globalCandidates) {
    console.log(`\n  ★ 候选: ${gc.scope}/${gc.name}[${gc.len}]`);
    
    // 提取 [21] 的详细信息
    const g21 = await cdp.send('Runtime.callFunctionOn', {
      objectId: gc.objectId,
      functionDeclaration: `function() {
        var item = this[21];
        if (!item) return JSON.stringify({type: typeof item});
        var keys = Object.keys(item).slice(0, 20);
        var propTypes = {};
        keys.forEach(function(k) { propTypes[k] = typeof item[k]; });
        return JSON.stringify({type: typeof item, keys: keys, propTypes: propTypes});
      }`,
      returnByValue: true,
    });
    console.log(`  [21]: ${g21.result.value}`);
    
    // 提取 [65] 的详细信息
    const g65 = await cdp.send('Runtime.callFunctionOn', {
      objectId: gc.objectId,
      functionDeclaration: `function() {
        var item = this[65];
        if (!item) return JSON.stringify({type: typeof item});
        if (typeof item !== 'object') return JSON.stringify({type: typeof item, value: item});
        var result = {type: typeof item, isArray: Array.isArray(item)};
        if (Array.isArray(item)) {
          result.length = item.length;
          result.elements = [];
          for (var i = 0; i < Math.min(item.length, 20); i++) {
            result.elements.push(i + ':' + typeof item[i] + (typeof item[i] === 'string' ? '="' + item[i].substring(0, 20) + '"' : typeof item[i] === 'number' ? '=' + item[i] : ''));
          }
        } else {
          result.keys = Object.keys(item).slice(0, 20);
        }
        return JSON.stringify(result);
      }`,
      returnByValue: true,
    });
    console.log(`  [65]: ${g65.result.value}`);
    
    // 如果 [65] 是数组，提取 [65][5]
    const g65parsed = JSON.parse(g65.result.value);
    if (g65parsed.isArray && g65parsed.length > 5) {
      const g655 = await cdp.send('Runtime.callFunctionOn', {
        objectId: gc.objectId,
        functionDeclaration: `function() {
          var item = this[65][5];
          return JSON.stringify({type: typeof item, value: typeof item === 'string' ? item : typeof item === 'number' ? item : undefined});
        }`,
        returnByValue: true,
      });
      console.log(`  [65][5]: ${g655.result.value}`);
    }
    
    // 提取 [21] 上 [65][5] 对应的函数
    const targetFunc = await cdp.send('Runtime.callFunctionOn', {
      objectId: gc.objectId,
      functionDeclaration: `function() {
        var obj = this[21];
        var propName = this[65] ? this[65][5] : null;
        if (!obj || propName === null || propName === undefined) return JSON.stringify({error: 'missing'});
        var fn = obj[propName];
        if (typeof fn !== 'function') return JSON.stringify({type: typeof fn, propName: propName});
        var src = Function.prototype.toString.call(fn);
        return JSON.stringify({propName: propName, isFunc: true, srcLen: src.length, src: src.substring(0, 500)});
      }`,
      returnByValue: true,
    });
    const tfParsed = JSON.parse(targetFunc.result.value);
    console.log(`  ★★ global[21][global[65][5]] = global[21]["${tfParsed.propName}"]`);
    if (tfParsed.src) {
      console.log(`  源码 (${tfParsed.srcLen} chars): ${tfParsed.src.substring(0, 300)}...`);
    }
  }
  
  // [7] 提取所有 global 数组元素的类型概览
  console.log('\n[7] Global 数组概览...');
  for (const gc of globalCandidates.slice(0, 1)) {
    const overview = await cdp.send('Runtime.callFunctionOn', {
      objectId: gc.objectId,
      functionDeclaration: `function() {
        var result = [];
        for (var i = 0; i < Math.min(this.length, 80); i++) {
          var t = typeof this[i];
          var desc = t;
          if (t === 'string') desc = '"' + this[i].substring(0, 15) + '"';
          else if (t === 'number') desc = '' + this[i];
          else if (t === 'function') desc = 'fn:' + (this[i].name || '?');
          else if (t === 'object' && this[i]) desc = Array.isArray(this[i]) ? 'arr[' + this[i].length + ']' : 'obj';
          else if (t === 'boolean') desc = '' + this[i];
          result.push(i + ':' + desc);
        }
        return result.join(', ');
      }`,
      returnByValue: true,
    });
    console.log(`  ${gc.name}: ${overview.result.value}`);
  }
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
