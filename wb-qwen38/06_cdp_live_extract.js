/**
 * 06_cdp_live_extract.js
 * 
 * CDP 实时提取 query 加密过程
 * 
 * 策略：
 * 1. 提取 prototype.send trampoline 的闭包数据（VM config + bytecode）
 * 2. 用 Runtime.evaluate 在浏览器中 hook send，捕获 query 生成过程
 * 3. 提取加密函数的输入/输出
 * 4. 同会话 keys + query 交叉验证
 * 
 * 关键发现：
 * - prototype.send 的 VM bytecode 包含 query 生成逻辑
 * - instance trampoline 的 bytecode 不同（只是 getter）
 * - 需要提取 prototype.send 的闭包才能理解 query 加密
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };

const OUTPUT_DIR = path.join(__dirname, 'captures');

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log('[1] 启动浏览器...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
    proxy: PROXY,
  });
  
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  
  // 收集 query 请求
  const queryRequests = [];
  cdp.on('Network.requestWillBeSent', (params) => {
    const url = params.request.url;
    if (url.includes('r20SZOQm=')) {
      const qMatch = url.match(/r20SZOQm=([^&]+)/);
      queryRequests.push({
        url: url.substring(0, 120),
        method: params.request.method,
        query: qMatch ? qMatch[1] : null,
        initiator: params.initiator?.type,
        timestamp: Date.now(),
      });
    }
  });
  
  // [2] 首次加载（412 → cookie）
  console.log('[2] 首次加载...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  
  // [3] Reload（200 → query 启用）
  console.log('[3] Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  // [4] 验证 query 工作
  console.log('[4] 验证 query...');
  const testResult = await evalCDP(cdp, `(function(){
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/px-gateway/GatewayConfig/security', false);
      xhr.send();
      return JSON.stringify({status: xhr.status, hasQuery: (xhr.responseURL||'').indexOf('r20SZOQm=')>=0, url: (xhr.responseURL||'').substring(0, 100)});
    } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
  })()`);
  console.log('  测试:', testResult);
  
  // [5] 提取 prototype.send 的真实源码
  console.log('\n[5] 提取 send hook 源码...');
  const sendSource = await evalCDP(cdp, `(function(){
    var send = XMLHttpRequest.prototype.send;
    var open = XMLHttpRequest.prototype.open;
    
    // 绕过 [native code] 伪装
    var realSource = '';
    try { realSource = Function.prototype.toString.call(send); } catch(e) { realSource = 'ERROR: ' + e.message; }
    
    var openSource = '';
    try { openSource = Function.prototype.toString.call(open); } catch(e) {}
    
    return JSON.stringify({
      sendName: send.name,
      openName: open.name,
      sendSourceLen: realSource.length,
      sendSource: realSource.substring(0, 2000),
      openSourceLen: openSource.length,
      sendIsOpen: send === open,
    });
  })()`);
  const sendInfo = JSON.parse(sendSource);
  console.log(`  send.name: ${sendInfo.sendName}`);
  console.log(`  open.name: ${sendInfo.openName}`);
  console.log(`  send === open: ${sendInfo.sendIsOpen}`);
  console.log(`  send 源码长度: ${sendInfo.sendSourceLen}`);
  console.log(`  send 源码前 200 字符: ${sendInfo.sendSource.substring(0, 200)}`);
  
  // [6] 提取 send hook 的 [[Scopes]] 闭包数据
  console.log('\n[6] 提取闭包数据...');
  
  // 获取 send 函数的 objectId
  const sendEval = await cdp.send('Runtime.evaluate', {
    expression: 'XMLHttpRequest.prototype.send',
    objectGroup: 'sendFn',
  });
  
  if (!sendEval.result.objectId) {
    console.log('  ❌ 无法获取 send objectId');
    await browser.close();
    return;
  }
  
  // 获取内部属性
  const props = await cdp.send('Runtime.getProperties', {
    objectId: sendEval.result.objectId,
    ownProperties: true,
  });
  
  // 找到 [[Scopes]]
  let scopesObj = null;
  if (props.internalProperties) {
    for (const ip of props.internalProperties) {
      if (ip.name === '[[Scopes]]') {
        scopesObj = ip.value;
      }
      if (ip.name === '[[FunctionLocation]]') {
        console.log(`  FunctionLocation: ${JSON.stringify(ip.value)}`);
      }
    }
  }
  
  if (!scopesObj) {
    console.log('  ❌ 无 [[Scopes]]');
    await browser.close();
    return;
  }
  
  // 遍历每层 scope
  const scopeProps = await cdp.send('Runtime.getProperties', {
    objectId: scopesObj.objectId,
    ownProperties: true,
  });
  
  console.log(`  Scope 层数: ${scopeProps.result.length}`);
  
  const allArrays = [];
  const allFunctions = [];
  const allObjects = [];
  
  for (const scope of scopeProps.result) {
    if (!scope.value || !scope.value.objectId) continue;
    
    const vars = await cdp.send('Runtime.getProperties', {
      objectId: scope.value.objectId,
      ownProperties: true,
    });
    
    for (const v of vars.result) {
      if (!v.value) continue;
      const { type, subtype, className, description, objectId } = v.value;
      
      if (type === 'object' && subtype === 'array' && objectId) {
        // 获取数组长度
        const arrProps = await cdp.send('Runtime.getProperties', {
          objectId,
          ownProperties: true,
        });
        const lenProp = arrProps.result.find(p => p.name === 'length');
        const len = lenProp?.value?.value || 0;
        
        if (len > 0 && len <= 1000) {
          // 获取数组内容（前 30 个元素）
          const preview = [];
          for (let i = 0; i < Math.min(len, 30); i++) {
            const elem = arrProps.result.find(p => p.name === String(i));
            if (elem && elem.value) {
              preview.push(elem.value.type === 'number' ? elem.value.value : 
                          elem.value.type === 'string' ? `"${elem.value.value.substring(0, 20)}"` :
                          elem.value.type);
            }
          }
          
          allArrays.push({
            scope: scope.name,
            name: v.name,
            length: len,
            preview: preview.join(','),
            objectId,
          });
        }
      } else if (type === 'function' && objectId) {
        allFunctions.push({ scope: scope.name, name: v.name, objectId });
      } else if (type === 'object' && objectId && className !== 'Array') {
        allObjects.push({ scope: scope.name, name: v.name, className, objectId });
      }
    }
  }
  
  console.log(`\n  闭包数组: ${allArrays.length} 个`);
  for (const arr of allArrays) {
    console.log(`    ${arr.scope}/${arr.name}: [${arr.length}] → ${arr.preview.substring(0, 100)}`);
  }
  
  console.log(`\n  闭包函数: ${allFunctions.length} 个`);
  for (const fn of allFunctions.slice(0, 10)) {
    console.log(`    ${fn.scope}/${fn.name}`);
  }
  
  console.log(`\n  闭包对象: ${allObjects.length} 个`);
  for (const obj of allObjects.slice(0, 10)) {
    console.log(`    ${obj.scope}/${obj.name}: ${obj.className}`);
  }
  
  // [7] 提取关键数组的完整内容
  console.log('\n[7] 提取关键数组...');
  const extractedData = {};
  
  for (const arr of allArrays) {
    // 提取特定大小的数组（可能是密钥或 S-Box）
    if ([4, 16, 17, 21, 32, 48, 86, 127, 209, 256, 489, 583, 909, 1170].includes(arr.length)) {
      const result = await cdp.send('Runtime.callFunctionOn', {
        objectId: arr.objectId,
        functionDeclaration: 'function() { return JSON.stringify(this); }',
        returnByValue: true,
      });
      if (result.result.value) {
        try {
          const data = JSON.parse(result.result.value);
          extractedData[`${arr.scope}_${arr.name}_${arr.length}`] = data;
          console.log(`  ✅ ${arr.name}[${arr.length}]: [${JSON.stringify(data).substring(0, 100)}]`);
        } catch(e) {}
      }
    }
  }
  
  // [8] 提取 VM 配置对象
  console.log('\n[8] 提取 VM 配置对象...');
  for (const obj of allObjects) {
    const objProps = await cdp.send('Runtime.getProperties', {
      objectId: obj.objectId,
      ownProperties: true,
    });
    
    const propNames = objProps.result.map(p => p.name).filter(n => n !== '__proto__');
    if (propNames.length > 0 && propNames.length < 20) {
      console.log(`  ${obj.name} (${obj.className}): {${propNames.join(', ')}}`);
      
      // 检查是否包含 bytecode 或 config
      for (const p of objProps.result) {
        if (p.value && p.value.type === 'object' && p.value.subtype === 'array') {
          const arrResult = await cdp.send('Runtime.callFunctionOn', {
            objectId: p.value.objectId,
            functionDeclaration: 'function() { return this.length; }',
            returnByValue: true,
          });
          console.log(`    .${p.name}: array[${arrResult.result.value}]`);
        } else if (p.value && p.value.type === 'number') {
          console.log(`    .${p.name}: ${p.value.value}`);
        } else if (p.value && p.value.type === 'boolean') {
          console.log(`    .${p.name}: ${p.value.value}`);
        } else if (p.value && p.value.type === 'string') {
          console.log(`    .${p.name}: "${p.value.value.substring(0, 40)}"`);
        }
      }
    }
  }
  
  // [9] 触发 POST 请求并捕获 query
  console.log('\n[9] 触发 POST 请求...');
  const postResult = await evalCDP(cdp, `(function(){
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
      xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
      xhr.send('{}');
      return JSON.stringify({
        status: xhr.status,
        url: xhr.responseURL || '',
        bodyLen: (xhr.responseText || '').length,
      });
    } catch(e) { return JSON.stringify({error: e.message.substring(0, 80)}); }
  })()`);
  console.log('  POST 结果:', postResult);
  
  // 再触发几个不同端点
  for (const ep of ['/px-gateway/GatewayConfig/security', '/px-common-authcenter/auth/v2/captcha/get']) {
    await evalCDP(cdp, `(function(){
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '${ep}', false);
        xhr.send('{}');
        return xhr.status;
      } catch(e) { return 'ERR'; }
    })()`);
  }
  
  await page.waitForTimeout(2000);
  
  // [10] 输出捕获的 query
  console.log(`\n[10] 捕获的 query 请求: ${queryRequests.length} 个`);
  for (const qr of queryRequests) {
    console.log(`  ${qr.method} ${qr.url}`);
    console.log(`    query: ${qr.query ? qr.query.substring(0, 60) + '...' : 'N/A'}`);
  }
  
  // [11] 提取 412 页面的 nsd/cd（用于管线 keys 对比）
  console.log('\n[11] 提取会话信息...');
  const sessionInfo = await evalCDP(cdp, `(function(){
    var cookies = document.cookie;
    return JSON.stringify({
      cookies: cookies.substring(0, 200),
      tsKeys: typeof $_ts !== 'undefined' ? Object.keys($_ts).length : -1,
    });
  })()`);
  console.log('  会话:', sessionInfo);
  
  // 保存所有数据
  const output = {
    timestamp: new Date().toISOString(),
    sendInfo,
    arrays: allArrays.map(a => ({ scope: a.scope, name: a.name, length: a.length, preview: a.preview })),
    functions: allFunctions.map(f => ({ scope: f.scope, name: f.name })),
    objects: allObjects.map(o => ({ scope: o.scope, name: o.name, className: o.className })),
    extractedData,
    queryRequests,
  };
  
  const outFile = path.join(OUTPUT_DIR, `cdp_extract_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\n[12] 数据已保存: ${outFile}`);
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

async function evalCDP(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  });
  return result.result.value;
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
