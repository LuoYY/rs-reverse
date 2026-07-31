/**
 * 17b_extract_query_func.js
 * 提取 global[21][global[65][5]] — query 生成函数
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

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
  
  // 验证
  const tv = await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  console.log('[2] 验证:', tv.result.value);
  
  // 获取 send 源码 → dispatcher 名
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
  console.log('[3] Dispatcher:', dName);
  
  // 获取 send 的 scopes → 找 dispatcher
  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId;
  }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  
  let dId;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId;
    }
  }
  
  // 获取 dispatcher 源码 → 找 global 变量名
  const dSrcR = await cdp.send('Runtime.callFunctionOn', {
    objectId: dId,
    functionDeclaration: 'function() { return Function.prototype.toString.call(this); }',
    returnByValue: true,
  });
  const dSrc = dSrcR.result.value;
  
  // 搜索 op32: <=32?stack[sp++]=GLOBAL[bytecode[++pc]]
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  console.log('[4] Global 变量名:', globalName);
  
  if (!globalName) {
    // 手动搜索
    const idx32 = dSrc.indexOf('<=32');
    console.log('  op32 上下文:', dSrc.substring(idx32, idx32 + 60));
    await browser.close();
    return;
  }
  
  // 在 dispatcher 闭包中搜索 global 变量
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) {
    if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId;
  }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === globalName && v.value?.objectId) {
        globalId = v.value.objectId;
        console.log('[5] 找到 global:', scope.name + '/' + v.name);
      }
    }
  }
  
  if (!globalId) {
    console.log('  ❌ 未在闭包中找到', globalName);
    // 列出所有闭包变量名
    for (const scope of dispScopes.result) {
      if (!scope.value?.objectId) continue;
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      const names = vars.result.map(v => v.name + ':' + (v.value?.type || '?')).join(', ');
      console.log(`  ${scope.name}: ${names}`);
    }
    await browser.close();
    return;
  }
  
  // [6] 提取 global 数组概览
  console.log('\n[6] Global 数组概览:');
  const overviewR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var r = [];
      for (var i = 0; i < this.length; i++) {
        var t = typeof this[i];
        var d;
        if (t === 'string') d = '"' + this[i].substring(0, 25) + '"';
        else if (t === 'number') d = '' + this[i];
        else if (t === 'function') {
          var src = Function.prototype.toString.call(this[i]);
          d = 'fn:' + (this[i].name || '?') + '(' + src.length + 'b)';
        }
        else if (t === 'object' && this[i]) d = Array.isArray(this[i]) ? 'arr[' + this[i].length + ']' : 'obj{' + Object.keys(this[i]).length + '}';
        else if (t === 'boolean') d = '' + this[i];
        else d = t;
        r.push(i + ':' + d);
      }
      return r.join('\\n');
    }`,
    returnByValue: true,
  });
  console.log(overviewR.result.value);
  fs.writeFileSync(path.join(OUT, 'global_overview.txt'), overviewR.result.value);
  
  // [7] ★★★ 提取 query 生成函数 ★★★
  console.log('\n[7] 提取 query 生成函数...');
  const qFuncR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var obj = this[21];
      var arr65 = this[65];
      if (!obj || !arr65) return JSON.stringify({error: 'missing', has21: !!obj, has65: !!arr65});
      var pn = arr65[5];
      if (pn === undefined) return JSON.stringify({error: 'arr65[5] undefined', arr65Len: arr65.length, arr65Types: Array.from(arr65).slice(0,10).map(function(x){return typeof x})});
      var fn = obj[pn];
      if (typeof fn !== 'function') return JSON.stringify({propName: '' + pn, type: typeof fn, objType: typeof obj, objKeys: obj ? Object.keys(obj).slice(0, 20) : null});
      var src = Function.prototype.toString.call(fn);
      return JSON.stringify({propName: '' + pn, name: fn.name, srcLen: src.length, src: src});
    }`,
    returnByValue: true,
  });
  
  const qf = JSON.parse(qFuncR.result.value);
  if (qf.error) {
    console.log('  错误:', JSON.stringify(qf));
  } else {
    console.log('  ★★★ global[21]["' + qf.propName + '"] (' + qf.srcLen + ' chars)');
    console.log('  函数名:', qf.name);
    console.log('\n  源码:');
    console.log(qf.src ? qf.src.substring(0, 3000) : 'N/A');
    if (qf.src) {
      fs.writeFileSync(path.join(OUT, 'query_gen_func.js'), qf.src);
      console.log('\n  已保存到 captures/query_gen_func.js');
    }
  }
  
  // [8] 也提取 global[21] 的所有方法
  console.log('\n[8] global[21] 的所有属性:');
  const g21R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var obj = this[21];
      if (!obj) return 'null';
      var r = [];
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var t = typeof obj[k];
        if (t === 'function') {
          var src = Function.prototype.toString.call(obj[k]);
          r.push(k + ': fn(' + src.length + 'b) ' + src.substring(0, 80));
        } else if (t === 'string') {
          r.push(k + ': "' + obj[k].substring(0, 30) + '"');
        } else if (t === 'number') {
          r.push(k + ': ' + obj[k]);
        } else {
          r.push(k + ': ' + t);
        }
      }
      return r.join('\\n');
    }`,
    returnByValue: true,
  });
  console.log(g21R.result.value);
  fs.writeFileSync(path.join(OUT, 'global21_methods.txt'), g21R.result.value);
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
