/**
 * 17_find_global.js
 * 
 * 从 dispatcher 源码中解析 op32 (LOAD_GLOBAL) 使用的变量名
 * 然后在闭包中找到该变量并提取 [21] 和 [65]
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
  
  console.log('[1] 启动...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  const test = await evalCDP(cdp, `(function(){ var x=new XMLHttpRequest(); x.open('GET','/px-gateway/GatewayConfig/security',false); x.send(); return x.status; })()`);
  console.log('[2] 验证:', test);
  
  // [3] 获取 dispatcher 完整源码
  console.log('\n[3] 获取 dispatcher 源码...');
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  
  let scopesId = null;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  const sendSrc = await evalCDP(cdp, `Function.prototype.toString.call(XMLHttpRequest.prototype.send)`);
  const dispatchMatch = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dispatcherName = dispatchMatch?.[1];
  
  let dispatcherId = null;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === dispatcherName && v.value?.type === 'function') {
        dispatcherId = v.value.objectId;
      }
    }
  }
  
  // 获取完整 dispatcher 源码
  const dispSrc = await cdp.send('Runtime.callFunctionOn', {
    objectId: dispatcherId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const dispatcherSource = dispSrc.result.value;
  console.log(`  Dispatcher: ${dispatcherName} (${dispatcherSource.length} chars)`);
  
  // [4] 从源码中解析 op32 的变量名
  console.log('\n[4] 解析操作码变量名...');
  
  // op32 格式: _$XX<=32?_$YY[_$ZZ++]=_$GLOBAL[_$BYTECODE[++_$PC]]
  // 搜索 <=32? 模式
  const op32Match = dispatcherSource.match(/<=32\?(\w+)\[\w+\+\+\]=(\w+)\[/);
  const globalVarName = op32Match?.[2];
  console.log(`  op32 LOAD_GLOBAL 变量: ${globalVarName}`);
  
  // op37 格式: <=37?_$YY[_$ZZ++]=$CONST[_$BYTECODE[++_$PC]]
  const op37Match = dispatcherSource.match(/<=37\?(\w+)\[\w+\+\+\]=(\w+)\[/);
  const constVarName = op37Match?.[2];
  console.log(`  op37 PUSH_CONST 变量: ${constVarName}`);
  
  // op11 格式: <=11?..._$_v=$GLOBAL2
  const op11Match = dispatcherSource.match(/<=11\?\(_?\$\w+=[_$\w]+\[\+\+_\$\w+\],_\$\w+=(\w+)\)/);
  console.log(`  op11 SET_TGT_GLOBAL 变量: ${op11Match?.[1]}`);
  
  // op14 格式: <=14?..._$_v=$CONST2
  const op14Match = dispatcherSource.match(/<=14\?\(_?\$\w+=[_$\w]+\[\+\+_\$\w+\],_\$\w+=(\w+)\)/);
  console.log(`  op14 SET_TGT_CONST 变量: ${op14Match?.[1]}`);
  
  // 也找 _$cR 中的变量
  // _$cR 中 <=11 对应 global, <=14 对应 const
  const crSection = dispatcherSource.substring(dispatcherSource.indexOf('function _$cR') || dispatcherSource.lastIndexOf('function'));
  
  // [5] 在 dispatcher 闭包中搜索 global 变量
  console.log('\n[5] 搜索闭包中的 global 变量...');
  
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dispatcherId, ownProperties: true });
  let dispScopesId = null;
  for (const ip of (dispProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId;
  }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  
  let globalArrayId = null;
  let constArrayId = null;
  
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    
    for (const v of vars.result) {
      // 按变量名匹配
      if (v.name === globalVarName && v.value?.objectId) {
        globalArrayId = v.value.objectId;
        console.log(`  ★ 找到 global: ${scope.name}/${v.name} (${v.value.subtype || v.value.type})`);
      }
      if (v.name === constVarName && v.value?.objectId) {
        constArrayId = v.value.objectId;
        console.log(`  ★ 找到 const: ${scope.name}/${v.name} (${v.value.subtype || v.value.type})`);
      }
    }
  }
  
  // [6] 提取 global[21] 和 global[65]
  if (globalArrayId) {
    console.log('\n[6] 提取 global[21] 和 global[65]...');
    
    // global[21]
    const g21Info = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalArrayId,
      functionDeclaration: `function() {
        var item = this[21];
        if (!item) return JSON.stringify({type: 'null/undefined'});
        var t = typeof item;
        if (t === 'function') {
          var src = Function.prototype.toString.call(item);
          return JSON.stringify({type: 'function', name: item.name, srcLen: src.length, src: src.substring(0, 500)});
        }
        if (t === 'object') {
          var keys = Object.keys(item).slice(0, 30);
          var propTypes = {};
          keys.forEach(function(k) { 
            var pt = typeof item[k]; 
            if (pt === 'function') propTypes[k] = 'fn:' + (item[k].name || '?');
            else if (pt === 'string') propTypes[k] = '"' + item[k].substring(0, 20) + '"';
            else if (pt === 'number') propTypes[k] = '' + item[k];
            else propTypes[k] = pt;
          });
          return JSON.stringify({type: 'object', keys: keys, propTypes: propTypes});
        }
        return JSON.stringify({type: t, value: item});
      }`,
      returnByValue: true,
    });
    console.log(`  global[21]: ${g21Info.result.value}`);
    
    // global[65]
    const g65Info = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalArrayId,
      functionDeclaration: `function() {
        var item = this[65];
        if (!item) return JSON.stringify({type: 'null/undefined'});
        var t = typeof item;
        if (Array.isArray(item)) {
          var elems = [];
          for (var i = 0; i < Math.min(item.length, 30); i++) {
            var et = typeof item[i];
            if (et === 'string') elems.push(i + ':"' + item[i].substring(0, 20) + '"');
            else if (et === 'number') elems.push(i + ':' + item[i]);
            else if (et === 'function') elems.push(i + ':fn:' + (item[i].name || '?'));
            else elems.push(i + ':' + et);
          }
          return JSON.stringify({type: 'array', length: item.length, elements: elems});
        }
        if (t === 'function') {
          var src = Function.prototype.toString.call(item);
          return JSON.stringify({type: 'function', name: item.name, srcLen: src.length, src: src.substring(0, 300)});
        }
        if (t === 'object') {
          return JSON.stringify({type: 'object', keys: Object.keys(item).slice(0, 20)});
        }
        return JSON.stringify({type: t, value: item});
      }`,
      returnByValue: true,
    });
    console.log(`  global[65]: ${g65Info.result.value}`);
    
    // global[65][5]
    const g655Info = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalArrayId,
      functionDeclaration: `function() {
        var item = this[65];
        if (!item || !item[5]) return JSON.stringify({error: 'missing'});
        return JSON.stringify({type: typeof item[5], value: item[5]});
      }`,
      returnByValue: true,
    });
    console.log(`  global[65][5]: ${g655Info.result.value}`);
    
    // ★ 最关键：global[21][global[65][5]] 的函数源码
    const targetFnInfo = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalArrayId,
      functionDeclaration: `function() {
        var obj = this[21];
        var arr65 = this[65];
        if (!obj || !arr65) return JSON.stringify({error: 'missing obj or arr65'});
        var propName = arr65[5];
        if (propName === undefined || propName === null) return JSON.stringify({error: 'missing propName'});
        var fn = obj[propName];
        if (typeof fn !== 'function') return JSON.stringify({propName: propName, type: typeof fn});
        var src = Function.prototype.toString.call(fn);
        return JSON.stringify({
          propName: propName, 
          isFunc: true, 
          name: fn.name,
          srcLen: src.length, 
          src: src.substring(0, 1000)
        });
      }`,
      returnByValue: true,
    });
    const tfInfo = JSON.parse(targetFnInfo.result.value);
    console.log(`\n  ★★★ QUERY 生成函数 ★★★`);
    console.log(`  global[21]["${tfInfo.propName}"] (${tfInfo.srcLen} chars)`);
    if (tfInfo.src) {
      console.log(`  源码:\n${tfInfo.src}`);
    }
    
    // 也提取 global 数组的完整概览
    console.log('\n[7] Global 数组完整概览...');
    const overview = await cdp.send('Runtime.callFunctionOn', {
      objectId: globalArrayId,
      functionDeclaration: `function() {
        var result = [];
        for (var i = 0; i < this.length; i++) {
          var t = typeof this[i];
          var desc;
          if (t === 'string') desc = '"' + this[i].substring(0, 20) + '"';
          else if (t === 'number') desc = '' + this[i];
          else if (t === 'function') desc = 'fn:' + (this[i].name || '?') + '(' + Function.prototype.toString.call(this[i]).length + ')';
          else if (t === 'object' && this[i]) desc = Array.isArray(this[i]) ? 'arr[' + this[i].length + ']' : 'obj{' + Object.keys(this[i]).length + '}';
          else if (t === 'boolean') desc = '' + this[i];
          else desc = t;
          result.push(i + ':' + desc);
        }
        return result.join('\\n');
      }`,
      returnByValue: true,
    });
    console.log(overview.result.value);
    
    // 保存
    fs.writeFileSync(path.join(OUT, 'global_array.txt'), overview.result.value);
    fs.writeFileSync(path.join(OUT, 'query_gen_func.js'), tfInfo.src || '// not found');
  }
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
