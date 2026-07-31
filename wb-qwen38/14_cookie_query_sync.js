/**
 * 14_cookie_query_sync.js
 * 
 * 验证 cookie 和 query 是否同步更新：
 * 1. 每次 XHR 请求前后捕获 document.cookie
 * 2. 同时捕获 query 参数
 * 3. 分析 cookie 变化与 query 变化的关系
 * 4. 测试旧 cookie + 新请求是否返回 200
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
  
  // 捕获所有请求的 cookie 和 query
  const requestLog = [];
  cdp.on('Network.requestWillBeSent', p => {
    const url = p.request.url;
    if (url.includes('pmos.xj.sgcc.com.cn') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png')) {
      const qMatch = url.match(/r20SZOQm=([^&]+)/);
      requestLog.push({
        url: url.substring(0, 120),
        method: p.request.method,
        query: qMatch ? qMatch[1] : null,
        cookies: p.request.headers?.Cookie || p.request.headers?.cookie || null,
        timestamp: Date.now(),
      });
    }
  });
  
  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(10000);
  
  // 验证
  const test = await evalCDP(cdp, `(function(){ var x=new XMLHttpRequest(); x.open('GET','/px-gateway/GatewayConfig/security',false); x.send(); return x.status; })()`);
  console.log('[3] 验证:', test);
  
  // [4] 连续发送多个请求，每次捕获 cookie 和 query
  console.log('\n[4] 连续请求测试...');
  
  const results = [];
  const endpoints = [
    { method: 'GET', path: '/px-gateway/GatewayConfig/security' },
    { method: 'POST', path: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{}' },
    { method: 'POST', path: '/px-common-authcenter/auth/v2/captcha/get', body: '{}' },
    { method: 'GET', path: '/px-gateway/GatewayConfig/security' },
    { method: 'POST', path: '/px-gateway/GatewayConfig/getGatewayConfig', body: '{"test":1}' },
  ];
  
  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    
    // 请求前的 cookie
    const cookieBefore = await evalCDP(cdp, 'document.cookie');
    
    // 发送请求
    let result;
    if (ep.method === 'GET') {
      result = await evalCDP(cdp, `(function(){
        var x = new XMLHttpRequest();
        x.open('GET', '${ep.path}', false);
        x.send();
        return JSON.stringify({status: x.status, url: x.responseURL || ''});
      })()`);
    } else {
      result = await evalCDP(cdp, `(function(){
        var x = new XMLHttpRequest();
        x.open('POST', '${ep.path}', false);
        x.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        x.send('${ep.body || "{}"}');
        return JSON.stringify({status: x.status, url: x.responseURL || ''});
      })()`);
    }
    
    // 请求后的 cookie
    const cookieAfter = await evalCDP(cdp, 'document.cookie');
    
    const parsed = JSON.parse(result);
    const qMatch = (parsed.url || '').match(/r20SZOQm=([^&]+)/);
    
    // 提取 P cookie
    const pCookieBefore = (cookieBefore || '').match(/aoU85Lxl9xxNP=([^;]+)/);
    const pCookieAfter = (cookieAfter || '').match(/aoU85Lxl9xxNP=([^;]+)/);
    
    const entry = {
      idx: i,
      method: ep.method,
      path: ep.path,
      status: parsed.status,
      query: qMatch ? qMatch[1] : null,
      pCookieBefore: pCookieBefore ? pCookieBefore[1].substring(0, 30) + '...' : null,
      pCookieAfter: pCookieAfter ? pCookieAfter[1].substring(0, 30) + '...' : null,
      cookieChanged: pCookieBefore?.[1] !== pCookieAfter?.[1],
      pCookieBeforeFull: pCookieBefore?.[1],
      pCookieAfterFull: pCookieAfter?.[1],
    };
    results.push(entry);
    
    console.log(`  [${i}] ${ep.method} ${ep.path.substring(0, 40)}`);
    console.log(`      status: ${parsed.status}`);
    console.log(`      query: ${entry.query ? entry.query.substring(0, 40) + '...' : 'N/A'}`);
    console.log(`      P cookie changed: ${entry.cookieChanged ? '✅ YES' : '❌ NO'}`);
    if (entry.cookieChanged) {
      console.log(`      before: ${entry.pCookieBefore}`);
      console.log(`      after:  ${entry.pCookieAfter}`);
    }
  }
  
  // [5] 分析 cookie 变化模式
  console.log('\n--- 5. Cookie 变化分析 ---');
  const changeCount = results.filter(r => r.cookieChanged).length;
  console.log(`  ${changeCount}/${results.length} 个请求导致 P cookie 变化`);
  
  // [6] 分析 query 的 session_data 是否随 cookie 变化
  console.log('\n--- 6. Query session_data 分析 ---');
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
  
  const decodedQueries = results.filter(r => r.query).map(r => {
    const bytes = string2numarr(r.query.substring(1));
    return {
      ...r,
      session: bytes.slice(7, 55),
      request: bytes.slice(56, 88),
    };
  });
  
  if (decodedQueries.length >= 2) {
    // 检查 session_data 是否全部相同
    const refSession = decodedQueries[0].session;
    const allSameSession = decodedQueries.every(q => 
      q.session.length === refSession.length && q.session.every((b, i) => b === refSession[i])
    );
    console.log(`  session_data 全部相同: ${allSameSession ? '✅ YES（同会话固定）' : '❌ NO（随请求变化！）'}`);
    
    if (!allSameSession) {
      // 找出哪些不同
      for (let i = 1; i < decodedQueries.length; i++) {
        const same = decodedQueries[i].session.every((b, j) => b === refSession[j]);
        console.log(`  Q[${i}] vs Q[0] session: ${same ? '相同' : '不同'} (cookie changed: ${decodedQueries[i].cookieChanged})`);
      }
    }
    
    // 检查 request_data 是否全部不同
    for (let i = 0; i < decodedQueries.length; i++) {
      console.log(`  Q[${i}] request: ${Buffer.from(decodedQueries[i].request).toString('hex').substring(0, 32)}...`);
    }
  }
  
  // [7] 测试旧 cookie 重放
  console.log('\n--- 7. 旧 cookie 重放测试 ---');
  if (results.length >= 2 && results[0].pCookieAfterFull) {
    const oldCookie = results[0].pCookieAfterFull;
    const currentCookie = await evalCDP(cdp, `(function(){
      var m = document.cookie.match(/aoU85Lxl9xxNP=([^;]+)/);
      return m ? m[1] : null;
    })()`);
    
    console.log(`  第一个请求后的 P cookie: ${oldCookie.substring(0, 30)}...`);
    console.log(`  当前 P cookie: ${currentCookie ? currentCookie.substring(0, 30) + '...' : 'N/A'}`);
    console.log(`  是否相同: ${oldCookie === currentCookie ? '✅ YES' : '❌ NO（已轮换）'}`);
    
    // 用 CDP 设置旧 cookie 并发请求
    if (oldCookie !== currentCookie) {
      console.log('\n  尝试用旧 cookie 发请求...');
      // 先保存当前 cookie
      const oCookie = await evalCDP(cdp, `(function(){
        var m = document.cookie.match(/aoU85Lxl9xxNO=([^;]+)/);
        return m ? m[1] : null;
      })()`);
      
      // 设置旧 P cookie
      await evalCDP(cdp, `document.cookie = 'aoU85Lxl9xxNP=${oldCookie}; path=/';`);
      
      // 发请求
      const oldResult = await evalCDP(cdp, `(function(){
        var x = new XMLHttpRequest();
        x.open('GET', '/px-gateway/GatewayConfig/security', false);
        x.send();
        return JSON.stringify({status: x.status, url: (x.responseURL || '').substring(0, 100)});
      })()`);
      const oldParsed = JSON.parse(oldResult);
      console.log(`  旧 cookie 请求结果: ${oldParsed.status}`);
      console.log(`  ${oldParsed.status === 200 ? '✅ 旧 cookie 仍然有效！' : '❌ 旧 cookie 被拒绝'}`);
      
      // 恢复当前 cookie
      if (currentCookie) {
        await evalCDP(cdp, `document.cookie = 'aoU85Lxl9xxNP=${currentCookie}; path=/';`);
      }
    }
  }
  
  // 保存结果
  const outFile = path.join(OUT, `cookie_query_sync_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ results, decodedQueries: decodedQueries.map(q => ({...q, session: [...q.session], request: [...q.request]})) }, null, 2));
  console.log(`\n[8] 保存: ${outFile}`);
  
  await browser.close();
  console.log('\n=== 完成 ===');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
