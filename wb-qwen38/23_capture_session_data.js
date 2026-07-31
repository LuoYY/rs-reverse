/**
 * 23_capture_session_data.js
 * 
 * 在页面加载期间 hook 加密函数，捕获 session_data 的生成过程
 * 
 * 策略：
 * 1. 用 addScriptToEvaluateOnNewDocument 注入 eval hook
 * 2. eval hook 拦截 RS 动态代码，在其中搜索加密函数模式并注入 logging
 * 3. 捕获页面加载期间的所有 encryptMode1 调用
 * 4. 找到生成 session_data 的调用
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
  
  // [1] 注入 eval hook（在页面 JS 执行前）
  console.log('[1] 注入 eval hook...');
  await page.addInitScript(() => {
    // 全局日志
    window.__encLog = [];
    window.__evalLog = [];
    
    const origEval = window.eval;
    window.eval = function(code) {
      if (typeof code === 'string' && code.length > 50000) {
        // 这是 RS 动态代码
        window.__evalLog.push({ len: code.length, time: Date.now() });
        
        // 搜索加密函数模式：
        // function NAME(a,b,c,d) { ... = FUNC(b,d); return result.METHOD(a,c); }
        // 特征：arguments.length 检查 + 两个函数调用
        
        // 策略：找到所有 "arguments.length" 出现的位置，然后向前找函数定义
        // 更简单的策略：找到 _$_X._$XX(_$gd,_$hd) 模式（encrypt/decrypt 方法调用）
        
        // 最简单：搜索 "charCodeAt" 附近的函数（getCfg 使用 charCodeAt）
        // 不对，getCfg 不使用 charCodeAt
        
        // 新策略：在动态代码末尾追加一个 hook 脚本
        // 动态代码执行后会创建全局数组（global array）
        // 我们可以在动态代码执行后搜索并 hook
        
        // 实际上，最可靠的方法是：
        // 1. 让动态代码正常执行
        // 2. 执行后，搜索新创建的函数
        // 3. Hook 加密函数
        
        // 但这需要在动态代码的 scope 内执行，从外部无法访问
        
        // 替代方案：修改动态代码，在加密函数定义后添加 hook
        // 加密函数特征：调用 getCfg (密钥扩展) 然后调用 encrypt/decrypt 方法
        
        // 搜索模式：function XXXX(a,b,c,d){...arguments.length...}
        // 在函数体中找到 "arguments.length" 的函数
        
        // 更精确：找到包含 "arguments.length" 和两个函数调用的函数
        // 模式：function NAME(_$gd,_$_X,_$hd,_$jD){...arguments.length...FUNC(_$_X...result.METHOD(_$gd...}
        
        // 最简单的方法：在动态代码中找到 encryptMode1 等价函数
        // 它的特征是：
        // 1. 接受 4 个参数
        // 2. 检查 arguments.length
        // 3. 调用密钥扩展函数
        // 4. 调用加密方法
        
        // 搜索 "arguments.length" 并提取包含它的函数
        var funcPattern = /function\s+([_$\w]+)\(([_$\w]+),([_$\w]+),([_$\w]+),([_$\w]+)\)\{[^}]*arguments\.length[^}]*\}/g;
        var match;
        var encFuncNames = [];
        while ((match = funcPattern.exec(code)) !== null) {
          encFuncNames.push(match[1]);
        }
        
        // 也搜索更宽松的模式
        var funcPattern2 = /function\s+([_$\w]+)\(([_$\w]+),([_$\w]+),([_$\w]+),([_$\w]+)\)\{var\s+[_$\w]+,[_$\w]+,[_$\w]+,[_$\w]+;[_$\w]+=arguments\.length/g;
        while ((match = funcPattern2.exec(code)) !== null) {
          if (!encFuncNames.includes(match[1])) {
            encFuncNames.push(match[1]);
          }
        }
        
        window.__evalLog.push({ encFuncNames: encFuncNames });
        
        // 在动态代码末尾追加 hook
        if (encFuncNames.length > 0) {
          var hookCode = '\n;window.__encFuncNames=' + JSON.stringify(encFuncNames) + ';';
          
          // 对每个加密函数，用 try-catch 包装来 hook
          for (var i = 0; i < encFuncNames.length; i++) {
            var fn = encFuncNames[i];
            hookCode += 'try{var __orig_' + fn + '=' + fn + ';' + fn + '=function(){' +
              'var __args=Array.prototype.slice.call(arguments);' +
              'var __entry={fn:"' + fn + '",dataLen:__args[0]&&__args[0].length?__args[0].length:null,' +
              'keyLen:__args[1]&&__args[1].length?__args[1].length:null,' +
              'flag:__args[2],time:Date.now()};' +
              'var __result=__orig_' + fn + '.apply(this,arguments);' +
              '__entry.resultLen=__result&&__result.length?__result.length:null;' +
              'if(__entry.dataLen&&__entry.dataLen<=300){' +
              '__entry.data=__args[0]?Array.prototype.slice.call(__args[0],0,50):null;' +
              '__entry.key=__args[1]?Array.prototype.slice.call(__args[1]):null;' +
              '__entry.result=__result?Array.prototype.slice.call(__result,0,50):null;' +
              '}' +
              'window.__encLog.push(__entry);' +
              'return __result;' +
              '};}catch(e){}\n';
          }
          
          code = code + hookCode;
        }
      }
      return origEval.call(this, code);
    };
  });
  
  // [2] 首次加载（412）
  console.log('[2] 首次加载（412）...');
  await page.goto('https://pmos.xj.sgcc.com.cn:20080/', { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  
  // 读取 eval 日志
  const evalLog1 = await page.evaluate(() => JSON.stringify(window.__evalLog || []));
  console.log('  Eval 日志 (412):', evalLog1);
  
  const encLog1 = await page.evaluate(() => JSON.stringify(window.__encLog || []));
  const encLogParsed1 = JSON.parse(encLog1);
  console.log(`  加密调用 (412): ${encLogParsed1.length} 次`);
  for (const e of encLogParsed1) {
    console.log(`    ${e.fn}: data=${e.dataLen}B key=${e.keyLen}B flag=${e.flag} → ${e.resultLen}B`);
  }
  
  // [3] 清空日志，然后 reload（200）
  console.log('\n[3] Reload（200）...');
  await page.evaluate(() => { window.__encLog = []; window.__evalLog = []; });
  
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  const evalLog2 = await page.evaluate(() => JSON.stringify(window.__evalLog || []));
  console.log('  Eval 日志 (200):', evalLog2);
  
  const encLog2 = await page.evaluate(() => JSON.stringify(window.__encLog || []));
  const encLogParsed2 = JSON.parse(encLog2);
  console.log(`  加密调用 (200): ${encLogParsed2.length} 次`);
  for (const e of encLogParsed2) {
    console.log(`    ${e.fn}: data=${e.dataLen}B key=${e.keyLen}B flag=${e.flag} → ${e.resultLen}B`);
    if (e.data) console.log(`      data[0:20]: [${e.data.slice(0, 20).join(',')}]`);
    if (e.key) console.log(`      key: [${e.key.join(',')}]`);
    if (e.result) console.log(`      result[0:20]: [${e.result.slice(0, 20).join(',')}]`);
  }
  
  // [4] 触发请求并捕获
  console.log('\n[4] 触发 POST...');
  await page.evaluate(() => { window.__encLog = []; });
  
  const postRes = await page.evaluate(() => {
    var x = new XMLHttpRequest();
    x.open('POST', '/px-gateway/GatewayConfig/getGatewayConfig', false);
    x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
    x.send('{}');
    return x.status + ' ' + (x.responseURL || '').substring(0, 120);
  });
  console.log('  POST:', postRes);
  
  const encLog3 = await page.evaluate(() => JSON.stringify(window.__encLog || []));
  const encLogParsed3 = JSON.parse(encLog3);
  console.log(`  加密调用 (POST): ${encLogParsed3.length} 次`);
  for (const e of encLogParsed3) {
    console.log(`    ${e.fn}: data=${e.dataLen}B key=${e.keyLen}B flag=${e.flag} → ${e.resultLen}B`);
    if (e.dataLen === 24 && e.data) {
      console.log(`      ★ QUERY 明文: [${e.data.join(',')}]`);
      console.log(`      key: [${e.key?.join(',')}]`);
    }
  }
  
  // [5] 检查 session_data
  console.log('\n[5] 检查 session_data...');
  // 从 query 中提取 session_data
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const queryMatch = postRes.match(/r20SZOQm=([^&\s]+)/);
  if (queryMatch) {
    const qBytes = [];
    const qStr = queryMatch[1].substring(1); // 去掉 '0' 前缀
    const lookup = {};
    basestr.split('').forEach((ch, idx) => { lookup[ch] = idx; });
    for (let i = 0; i < qStr.length; i += 4) {
      const c0 = lookup[qStr[i]], c1 = lookup[qStr[i+1]], c2 = lookup[qStr[i+2]], c3 = lookup[qStr[i+3]];
      if (c0 !== undefined && c1 !== undefined) qBytes.push((c0 << 2) | (c1 >> 4));
      if (c1 !== undefined && c2 !== undefined) qBytes.push(((c1 & 15) << 4) | (c2 >> 2));
      if (c2 !== undefined && c3 !== undefined) qBytes.push(((c2 & 3) << 6) | c3);
    }
    const sessionData = qBytes.slice(7, 55);
    console.log(`  session_data (48B): [${sessionData.join(',')}]`);
    
    // 检查 session_data 是否在任何加密调用的结果中
    for (const e of [...encLogParsed1, ...encLogParsed2]) {
      if (e.result && e.resultLen >= 48) {
        // 检查结果的前 48 字节是否匹配 session_data
        const match = e.result.slice(0, 20).join(',') === sessionData.slice(0, 20).join(',');
        if (match) {
          console.log(`  ★ session_data 匹配: ${e.fn} data=${e.dataLen}B → ${e.resultLen}B`);
        }
      }
    }
  }
  
  // 保存所有数据
  fs.writeFileSync(path.join(OUT, 'session_data_capture.json'), JSON.stringify({
    evalLog1: JSON.parse(evalLog1),
    encLog412: encLogParsed1,
    encLog200: encLogParsed2,
    encLogPOST: encLogParsed3,
  }, null, 2));
  console.log('\n[6] 保存到 captures/session_data_capture.json');
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
