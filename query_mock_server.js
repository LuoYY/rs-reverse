/**
 * query_mock_server.js — Mock 服务器 + CDP 精确断点
 *
 * 用本地 HTTP 服务器 mock 主页和瑞数 JS
 * 变量名固定 → 可以在动态代码中精确定位 _$h4
 * → 设断点 → 捕获 query 生成过程
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = __dirname;

// 保存的挑战页数据（固定 nsd/cd）
let savedChallenge = null;

(async () => {
  // Step 1: 获取一次真实挑战页（保存 nsd/cd + O cookie）
  console.log('[Step 1] 获取真实挑战页...');
  const { httpGet } = require('./proxy_http');
  const ch = await httpGet('https://pmos.xj.sgcc.com.cn:20080/', { userAgent: 'Mozilla/5.0' });
  const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  if (!m) { console.log('no ts'); process.exit(1); }
  const nsd = +m[1], cd = m[2];
  const sc = [].concat(ch.headers['set-cookie'] || []);
  const oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || sc.map(c => c.split(';')[0])[0];

  savedChallenge = { nsd, cd, oCookie, body: ch.body };
  console.log(`nsd=${nsd}, cd_len=${cd.length}`);

  // Step 2: 启动 mock 服务器
  console.log('\n[Step 2] 启动 mock 服务器...');
  const mockPort = 19888;
  const outerJs = fs.readFileSync(path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');

  const server = http.createServer((req, res) => {
    const url = req.url;

    if (url === '/' || url === '/index.html') {
      // 返回保存的挑战页
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': `${savedChallenge.oCookie}; Path=/`,
      });
      res.end(savedChallenge.body);
    } else if (url.includes('rGTR1U4jJCVr')) {
      // 返回外层 JS
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(outerJs);
    } else if (url.includes('/px-')) {
      // API 请求 — 返回假数据
      console.log(`  [Mock] API: ${req.method} ${url.substring(0, 80)}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 0, message: 'Success', data: {} }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(r => server.listen(mockPort, r));
  console.log(`Mock server: http://localhost:${mockPort}`);

  // Step 3: 用 Patchright 加载 mock 页面
  console.log('\n[Step 3] Patchright 加载 mock 页面...');
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  // 收集脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (e) => { scripts[e.scriptId] = { url: e.url || '' }; });

  // 捕获所有请求
  const allRequests = [];
  context.on('request', req => {
    allRequests.push({ method: req.method(), url: req.url() });
  });

  // 加载 mock 页面
  await page.goto(`http://localhost:${mockPort}/`, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => console.log('goto:', e.message.substring(0, 50)));
  await page.waitForTimeout(3000);

  console.log(`Scripts: ${Object.keys(scripts).length}`);
  console.log(`Requests: ${allRequests.length}`);

  // 检查 RS 是否执行了
  const rsCheck = await page.evaluate(() => {
    const ts = window.$_ts || {};
    return {
      tsKeys: Object.keys(ts),
      hasL: typeof ts.l__ === 'function',
      cookies: document.cookie.substring(0, 80),
    };
  }).catch(() => null);
  console.log('RS check:', JSON.stringify(rsCheck));

  // Step 4: 在动态代码中搜索关键模式
  console.log('\n[Step 4] 搜索动态代码中的关键模式...');

  // 找到最大的 eval 脚本
  let dynScriptId = null;
  let dynScriptSrc = null;
  let dynScriptLen = 0;
  for (const [scriptId, info] of Object.entries(scripts)) {
    if (info.url) continue;
    try {
      const src = await client.send('Debugger.getScriptSource', { scriptId });
      if (src.scriptSource.length > dynScriptLen) {
        dynScriptLen = src.scriptSource.length;
        dynScriptId = scriptId;
        dynScriptSrc = src.scriptSource;
      }
    } catch (e) {}
  }

  if (dynScriptSrc) {
    console.log(`Dynamic code: ${dynScriptId} (${dynScriptLen} chars)`);

    // 搜索关键模式
    const patterns = [
      { name: '.send(', search: '.send(' },
      { name: '.open(', search: '.open(' },
      { name: 'XMLHttpRequest', search: 'XMLHttpRequest' },
      { name: 'new _$', search: 'new _$' },
      { name: 'r20SZOQm', search: 'r20SZOQm' },
      { name: 'onreadystatechange', search: 'onreadystatechange' },
      { name: 'defineProperty', search: 'defineProperty' },
      { name: 'responseText', search: 'responseText' },
      { name: 'readyState', search: 'readyState' },
    ];

    for (const { name, search } of patterns) {
      const positions = [];
      let pos = 0;
      while ((pos = dynScriptSrc.indexOf(search, pos)) !== -1) {
        positions.push(pos);
        pos += search.length;
      }
      if (positions.length > 0) {
        console.log(`\n  "${name}": ${positions.length} occurrences`);
        // 显示前 3 个的上下文
        positions.slice(0, 3).forEach(p => {
          const ctx = dynScriptSrc.substring(Math.max(0, p - 30), p + 50);
          console.log(`    at ${p}: ...${ctx}...`);
        });
      }
    }

    // 搜索 defineProperty（RS 安装 getter/setter 的地方）
    console.log('\n=== defineProperty 详细分析 ===');
    let dpPos = 0;
    let dpCount = 0;
    while ((dpPos = dynScriptSrc.indexOf('defineProperty', dpPos)) !== -1 && dpCount < 10) {
      // 获取上下文
      const ctx = dynScriptSrc.substring(Math.max(0, dpPos - 60), dpPos + 120);
      console.log(`\n  [${dpCount}] at ${dpPos}:`);
      console.log(`    ${ctx}`);
      dpPos += 14;
      dpCount++;
    }

    // 搜索 .send( — RS 的 XHR send wrapper
    console.log('\n=== .send( 分析 ===');
    let sendPos = 0;
    let sendCount = 0;
    while ((sendPos = dynScriptSrc.indexOf('.send(', sendPos)) !== -1 && sendCount < 10) {
      const ctx = dynScriptSrc.substring(Math.max(0, sendPos - 80), sendPos + 40);
      console.log(`\n  [${sendCount}] at ${sendPos}:`);
      console.log(`    ...${ctx}...`);

      // 尝试提取函数名
      const fnMatch = ctx.match(/function\s+(_\$[a-zA-Z0-9]+)/g);
      if (fnMatch) console.log(`    Functions: ${fnMatch.join(', ')}`);

      sendPos += 6;
      sendCount++;
    }

    // 搜索 new XMLHttpRequest 或 new _$
    console.log('\n=== new XHR 分析 ===');
    const newXhrPattern = /new\s+(_\$[a-zA-Z0-9]+)\s*\(/g;
    let match;
    while ((match = newXhrPattern.exec(dynScriptSrc)) !== null) {
      const ctx = dynScriptSrc.substring(Math.max(0, match.index - 40), match.index + 60);
      console.log(`  at ${match.index}: ${match[0]} → ...${ctx}...`);
    }

    // 保存动态代码供分析
    fs.writeFileSync('/tmp/mock-dyn-code.js', dynScriptSrc);
    console.log('\n动态代码已保存到 /tmp/mock-dyn-code.js');
  }

  // Step 5: 检查是否有 query 请求（mock 服务器返回 200，RS 应该启用 query）
  console.log('\n[Step 5] 检查 query 请求...');
  // reload 触发 SPA API
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const queryReqs = allRequests.filter(r => r.url.includes('r20SZOQm='));
  console.log(`Query requests: ${queryReqs.length}`);
  queryReqs.slice(0, 3).forEach((r, i) => console.log(`  [${i}] ${r.method} ${r.url.substring(0, 100)}`));

  // Step 6: 如果有 query，在动态代码中设精确断点
  if (queryReqs.length > 0 && dynScriptSrc) {
    console.log('\n[Step 6] 设精确断点...');

    // 找到 .send( 的位置（RS 发送 XHR 的地方）
    const sendIdx = dynScriptSrc.indexOf('.send(');
    if (sendIdx >= 0) {
      // 计算行号和列号
      let line = 0;
      let col = 0;
      for (let i = 0; i < sendIdx; i++) {
        if (dynScriptSrc[i] === '\n') { line++; col = 0; }
        else { col++; }
      }
      console.log(`.send( at line ${line}, col ${col}`);

      // 设断点
      try {
        const bp = await client.send('Debugger.setBreakpoint', {
          location: { scriptId: dynScriptId, lineNumber: line, columnNumber: col },
        });
        console.log(`Breakpoint: ${bp.breakpointId}`);
        if (bp.actualLocation) {
          console.log(`  Actual: line ${bp.actualLocation.lineNumber}, col ${bp.actualLocation.columnNumber}`);
        }
      } catch (e) {
        console.log(`Breakpoint error: ${e.message.substring(0, 80)}`);
      }
    }
  }

  // 清理
  await browser.close();
  server.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
