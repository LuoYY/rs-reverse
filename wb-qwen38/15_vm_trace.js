/**
 * 15_vm_trace.js
 * 
 * 深入 VM 子程序追踪：
 * 1. 修正反汇编（考虑 _$cR 辅助函数消耗额外 bytecode）
 * 2. 提取关键闭包函数：closure[1][25], closure[1][26], global[21], global[65]
 * 3. 获取这些函数的源码
 * 4. 理解 query 生成的完整调用链
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
  
  // [4] 提取 send hook 的闭包变量
  console.log('\n[4] 提取闭包变量...');
  
  // 获取 send 函数
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  
  let scopesId = null;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  // 收集所有闭包变量
  const closureVars = {};
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      closureVars[`${scope.name}/${v.name}`] = v.value;
    }
  }
  
  // [5] 提取 send hook 源码中的变量名映射
  console.log('\n[5] 分析 send hook 源码...');
  const sendSrc = await evalCDP(cdp, `Function.prototype.toString.call(XMLHttpRequest.prototype.send)`);
  console.log('  Send 源码:', sendSrc);
  
  // 从源码中提取关键变量名
  // 格式: function _$$D(){...if(_$i4._$gJ)..._$hD(_$i4,0,_$i4._$kN.length,_$dd)...}
  const configMatch = sendSrc.match(/if\(([_$\w]+)\.([_$\w]+)\)/);
  const dispatchMatch = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const scopeMatch = sendSrc.match(/([_$\w]+)\[1\]\.concat/);
  const closureMatch = sendSrc.match(/([_$\w]+)\[3\]\.concat/);
  
  const varNames = {
    configObj: configMatch?.[1],     // _$i4
    cacheFlag: configMatch?.[2],     // _$gJ
    dispatcher: dispatchMatch?.[1],  // _$hD
    bytecodeProp: dispatchMatch?.[4], // _$kN
    scopeArr: scopeMatch?.[1],       // _$_v
    closureArr: closureMatch?.[1],   // _$_v (same)
  };
  console.log('  变量映射:', JSON.stringify(varNames, null, 2));
  
  // [6] 通过 CDP 在浏览器中直接提取关键函数
  console.log('\n[6] 提取关键闭包函数...');
  
  // 方法：在浏览器中执行代码，通过 send 函数的闭包访问内部变量
  // 我们不能直接访问闭包，但可以通过间接方式
  
  // 首先，找到 scope 数组（_$_v）和 closure 数组
  // 从 send 源码：_$dd[1]=_$_v[1].concat([arguments]), _$dd[3]=_$_v[3].concat([_$$D])
  // _$_v 是 scope 数组，_$_v[1] 是 arguments 模板，_$_v[3] 是 closure 模板
  
  // 通过 getProperties 遍历 scope 层
  const scopeData = {};
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (!v.value) continue;
      
      // 检查是否是数组（可能是 scope 数组或 closure 数组）
      if (v.value.type === 'object' && v.value.subtype === 'array' && v.value.objectId) {
        const lenR = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return this.length; }',
          returnByValue: true,
        });
        const len = lenR.result.value;
        
        // 4 元素数组可能是 scope 数组 [this, args_template, scope_obj, closure_template]
        if (len === 4) {
          const types = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: `function() { 
              return JSON.stringify(Array.from(this).map(function(x, i) { 
                return i + ':' + typeof x + (Array.isArray(x) ? '[' + x.length + ']' : ''); 
              })); 
            }`,
            returnByValue: true,
          });
          console.log(`  ${scope.name}/${v.name}[4]: ${types.result.value}`);
          scopeData[v.name] = { objectId: v.value.objectId, len, types: JSON.parse(types.result.value) };
        }
      }
      
      // 检查函数
      if (v.value.type === 'function' && v.value.objectId) {
        const srcR = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return Function.prototype.toString.call(this).substring(0, 200); }',
          returnByValue: true,
        });
        // 只打印关键函数
        if (v.name === varNames.dispatcher) {
          console.log(`  ★ Dispatcher ${v.name}: ${srcR.result.value.substring(0, 100)}...`);
        }
      }
    }
  }
  
  // [7] 在浏览器中直接执行提取脚本
  console.log('\n[7] 浏览器内提取关键函数...');
  
  // 通过 hook send 来捕获闭包变量
  const extractResult = await evalCDP(cdp, `(function(){
    var results = {};
    
    // 获取 send 函数
    var send = XMLHttpRequest.prototype.send;
    var src = Function.prototype.toString.call(send);
    
    // 提取变量名
    var m1 = src.match(/new ([_$\\w]+)\\(([_$\\w]+)\\.([_$\\w]+)\\)/);
    var scopeClassName = m1 ? m1[1] : null;
    
    var m2 = src.match(/([_$\\w]+)\\[1\\]\\.concat/);
    var scopeArrName = m2 ? m2[1] : null;
    
    // 提取常量池引用
    var m3 = src.match(/([_$\\w]+)\\.charCodeAt\\?/);
    var configName = m3 ? m3[1] : null;
    
    results.scopeClassName = scopeClassName;
    results.scopeArrName = scopeArrName;
    results.configName = configName;
    
    // 通过创建一个 XHR 并调用 open 来触发 RS hook
    // 然后检查 XHR 实例上的属性
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/px-gateway/GatewayConfig/security', false);
    
    // 检查 XHR 实例上的 RS 属性
    var xhrProps = [];
    for (var k in xhr) {
      if (k.indexOf('_$') === 0) {
        xhrProps.push(k + ':' + typeof xhr[k]);
      }
    }
    results.xhrProps = xhrProps;
    
    // 检查 prototype 上的 RS 属性
    var protoProps = [];
    var proto = XMLHttpRequest.prototype;
    var descriptors = Object.getOwnPropertyDescriptors(proto);
    for (var k in descriptors) {
      if (descriptors[k].get || descriptors[k].set) {
        protoProps.push(k + ':' + (descriptors[k].get ? 'getter' : '') + (descriptors[k].set ? '/setter' : ''));
      }
    }
    results.protoGettersSetters = protoProps;
    
    // 检查 prototype.send 的属性
    var sendDesc = Object.getOwnPropertyDescriptor(proto, 'send');
    results.sendDescriptor = {
      writable: sendDesc?.writable,
      enumerable: sendDesc?.enumerable,
      configurable: sendDesc?.configurable,
      hasValue: !!sendDesc?.value,
      hasGet: !!sendDesc?.get,
    };
    
    return JSON.stringify(results);
  })()`);
  
  console.log('  提取结果:', extractResult);
  
  // [8] 通过 CDP 获取 send 闭包中的函数源码
  console.log('\n[8] 提取闭包函数源码...');
  
  // 遍历所有 scope 层的函数，获取完整源码
  const functionSources = {};
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (v.value?.type === 'function' && v.value.objectId) {
        const srcR = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
          returnByValue: true,
        });
        const src = srcR.result.value;
        const key = `${scope.name}/${v.name}`;
        functionSources[key] = { name: v.name, scope: scope.name, len: src.length, src: src.substring(0, 500) };
        
        // 打印 trampoline 结构的函数（包含 ._ 属性访问）
        if (src.includes('.charCodeAt') || src.includes('concat([arguments])')) {
          console.log(`\n  ★ Trampoline ${key} (${src.length} chars):`);
          console.log(`    ${src.substring(0, 300)}...`);
        }
      }
    }
  }
  
  // [9] 提取 489 元素混合常量池（_$lV/_$$m）中的函数
  console.log('\n[9] 提取常量池中的函数...');
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      if (v.value?.type === 'object' && v.value?.subtype === 'array' && v.value?.objectId) {
        const lenR = await cdp.send('Runtime.callFunctionOn', {
          objectId: v.value.objectId,
          functionDeclaration: 'function() { return this.length; }',
          returnByValue: true,
        });
        
        if (lenR.result.value === 489) {
          console.log(`  找到 489 元素常量池: ${scope.name}/${v.name}`);
          
          // 提取其中的函数元素
          const funcInfo = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: `function() {
              var funcs = [];
              for (var i = 0; i < this.length; i++) {
                if (typeof this[i] === 'function') {
                  var src = Function.prototype.toString.call(this[i]);
                  funcs.push({idx: i, name: this[i].name, len: src.length, preview: src.substring(0, 100)});
                }
              }
              return JSON.stringify(funcs);
            }`,
            returnByValue: true,
          });
          
          const funcs = JSON.parse(funcInfo.result.value);
          console.log(`  包含 ${funcs.length} 个函数:`);
          for (const f of funcs.slice(0, 20)) {
            console.log(`    [${f.idx}] ${f.name} (${f.len} chars): ${f.preview.substring(0, 80)}...`);
          }
          
          // 提取非函数元素
          const nonFuncInfo = await cdp.send('Runtime.callFunctionOn', {
            objectId: v.value.objectId,
            functionDeclaration: `function() {
              var items = [];
              for (var i = 0; i < Math.min(this.length, 50); i++) {
                var t = typeof this[i];
                if (t === 'string') items.push(i + ':"' + this[i].substring(0, 30) + '"');
                else if (t === 'number') items.push(i + ':' + this[i]);
                else if (t === 'boolean') items.push(i + ':' + this[i]);
                else if (t === 'undefined') items.push(i + ':undefined');
                else items.push(i + ':' + t);
              }
              return items.join(', ');
            }`,
            returnByValue: true,
          });
          console.log(`  前 50 个非函数元素: ${nonFuncInfo.result.value}`);
        }
      }
    }
  }
  
  // [10] 触发 POST 并捕获完整执行
  console.log('\n[10] 触发 POST...');
  const postRes = await evalCDP(cdp, `(function(){
    var x = new XMLHttpRequest();
    x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
    x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    x.send('{}');
    return x.status + ' ' + (x.responseURL || '').substring(0, 120);
  })()`);
  console.log('  POST:', postRes);
  
  // 保存所有数据
  const outFile = path.join(OUT, `vm_trace_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ varNames, functionSources, extractResult: JSON.parse(extractResult) }, null, 2));
  console.log(`\n[11] 保存: ${outFile}`);
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
