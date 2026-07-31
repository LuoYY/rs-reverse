/**
 * 18_extract_crypto.js
 * 
 * 提取 global 数组中的大型 RS 函数源码
 * 重点：109(757b), 139(955b), 150(1045b) 等
 * 寻找加密算法特征（S-Box、轮常量、XOR 链等）
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
  
  const tv = await cdp.send('Runtime.evaluate', {
    expression: '(function(){var x=new XMLHttpRequest();x.open("GET","/px-gateway/GatewayConfig/security",false);x.send();return x.status})()',
    returnByValue: true,
  });
  console.log('[2] 验证:', tv.result.value);
  
  // 获取 dispatcher → global 变量名
  const sendSrcR = await cdp.send('Runtime.evaluate', {
    expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)',
    returnByValue: true,
  });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
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
  const dSrc = dSrcR.result.value;
  const m32 = dSrc.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32[1];
  console.log('[3] Global:', globalName);
  
  // 找 global 数组
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
  
  if (!globalId) { console.log('❌ 未找到 global'); await browser.close(); return; }
  
  // [4] 提取所有 > 100 字节的 RS 函数源码
  console.log('\n[4] 提取大型 RS 函数...');
  
  const largeFuncsR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var results = [];
      for (var i = 0; i < this.length; i++) {
        if (typeof this[i] === 'function') {
          var src = Function.prototype.toString.call(this[i]);
          // 跳过 native 函数和小型 trampoline
          if (src.includes('[native code]')) continue;
          if (src.length < 100) continue;
          results.push({idx: i, name: this[i].name, len: src.length, src: src});
        }
      }
      return JSON.stringify(results);
    }`,
    returnByValue: true,
  });
  
  const largeFuncs = JSON.parse(largeFuncsR.result.value);
  console.log(`  找到 ${largeFuncs.length} 个大型 RS 函数`);
  
  // 保存所有大型函数
  const allSrc = largeFuncs.map(f => 
    `// [${f.idx}] ${f.name} (${f.len} bytes)\n${f.src}`
  ).join('\n\n');
  fs.writeFileSync(path.join(OUT, 'rs_functions.js'), allSrc);
  console.log('  已保存到 captures/rs_functions.js');
  
  // 分析每个函数的特征
  console.log('\n[5] 函数特征分析:');
  for (const f of largeFuncs) {
    const features = [];
    if (f.src.includes('^')) features.push('XOR');
    if (f.src.includes('>>>')) features.push('SHIFT');
    if (f.src.includes('&255') || f.src.includes('& 255')) features.push('BYTE_MASK');
    if (f.src.includes('charCodeAt')) features.push('CHAR_CODE');
    if (f.src.includes('fromCharCode')) features.push('FROM_CHAR');
    if (f.src.includes('push')) features.push('PUSH');
    if (f.src.includes('slice')) features.push('SLICE');
    if (f.src.includes('concat')) features.push('CONCAT');
    if (f.src.includes('join')) features.push('JOIN');
    if (f.src.includes('split')) features.push('SPLIT');
    if (f.src.includes('Math')) features.push('MATH');
    if (f.src.includes('for') || f.src.includes('while')) features.push('LOOP');
    if (f.src.includes('256') || f.src.includes('0x100')) features.push('256');
    if (f.src.includes('16') || f.src.includes('0x10')) features.push('16');
    if (f.src.includes('cookie') || f.src.includes('Cookie')) features.push('COOKIE');
    if (f.src.includes('encrypt') || f.src.includes('Encrypt')) features.push('ENCRYPT');
    
    // 检查是否是 trampoline（包含 ._$ 属性访问模式）
    const isTrampoline = f.src.includes('.charCodeAt') && f.src.includes('.length') && f.src.includes('concat');
    if (isTrampoline) features.push('TRAMPOLINE');
    
    console.log(`  [${f.idx}] ${f.name} (${f.len}b): ${features.join(', ')}`);
    
    // 打印非 trampoline 的大型函数的前 200 字符
    if (!isTrampoline && f.len > 200) {
      console.log(`    预览: ${f.src.substring(0, 200)}...`);
    }
  }
  
  // [6] 提取 489 元素常量池中的字符串和数字
  console.log('\n[6] 常量池非函数元素:');
  const nonFuncR = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var results = [];
      for (var i = 0; i < this.length; i++) {
        var t = typeof this[i];
        if (t === 'string') results.push({idx: i, type: 'string', value: this[i]});
        else if (t === 'number') results.push({idx: i, type: 'number', value: this[i]});
        else if (t === 'boolean') results.push({idx: i, type: 'boolean', value: this[i]});
        else if (t === 'object' && this[i] && !Array.isArray(this[i])) {
          results.push({idx: i, type: 'object', keys: Object.keys(this[i]).slice(0, 10)});
        }
        else if (t === 'object' && Array.isArray(this[i])) {
          results.push({idx: i, type: 'array', length: this[i].length});
        }
      }
      return JSON.stringify(results);
    }`,
    returnByValue: true,
  });
  
  const nonFunc = JSON.parse(nonFuncR.result.value);
  for (const item of nonFunc) {
    if (item.type === 'string') console.log(`  [${item.idx}] "${item.value}"`);
    else if (item.type === 'number') console.log(`  [${item.idx}] ${item.value}`);
    else if (item.type === 'boolean') console.log(`  [${item.idx}] ${item.value}`);
    else if (item.type === 'object') console.log(`  [${item.idx}] obj{${item.keys.join(',')}}`);
    else if (item.type === 'array') console.log(`  [${item.idx}] arr[${item.length}]`);
  }
  
  // 保存
  fs.writeFileSync(path.join(OUT, 'global_constants.json'), JSON.stringify(nonFunc, null, 2));
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
