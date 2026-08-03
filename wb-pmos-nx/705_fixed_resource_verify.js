/**
 * 705_fixed_resource_verify.js
 * 验证 reqable/route.fulfill 固定资源方案：
 * 固定同一份 412 html（同一 nsd/cd）+ 固定外层 JS → 两次加载 dynCode 是否字节级一致
 * 方法：CDP Debugger.scriptParsed + getScriptSource（不注入 JS，规避瑞数 eval hook 检测）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const fs = require('fs');
const path = require('path');
const http = require('http');
const tls = require('tls');
const crypto = require('crypto');
const { chromium } = require(path.join('/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules', 'patchright'));

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY_URL = new URL('http://74940609:aFmWc5Fs@36.134.44.6:2018');
const PROXY_AUTH = 'Basic ' + Buffer.from(PROXY_URL.username + ':' + PROXY_URL.password).toString('base64');

const LOCAL_HTML = '/tmp/nx_local_412.html';
const LOCAL_JS = '/Users/luoyy/work/github/GitHub/rs-reverse_glm/example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js';

function httpsGet(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const connectReq = http.request({
      host: PROXY_URL.hostname, port: +PROXY_URL.port, method: 'CONNECT',
      path: `${u.hostname}:${u.port || 443}`,
      headers: { 'Proxy-Authorization': PROXY_AUTH, Host: `${u.hostname}:${u.port || 443}` },
      timeout: 25000,
    });
    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); resolve({ status: 'ERR' }); return; }
      const tlsSock = tls.connect({ socket, servername: u.hostname, rejectUnauthorized: false }, () => {
        tlsSock.write(`GET ${u.pathname + u.search} HTTP/1.1\r\nHost: ${u.hostname}:${u.port || 443}\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nConnection: close\r\n\r\n`);
      });
      let body = '', raw = '';
      tlsSock.on('data', d => raw += d);
      tlsSock.on('end', () => {
        const headEnd = raw.indexOf('\r\n\r\n');
        if (headEnd >= 0) {
          const resHead = raw.substring(0, headEnd);
          resolve({ status: parseInt((resHead.split(' ')[1] || '').trim()), body: raw.substring(headEnd + 4) });
        } else resolve({ status: 'ERR' });
      });
      tlsSock.on('error', e => resolve({ status: 'ERR' }));
    });
    connectReq.on('error', e => resolve({ status: 'ERR' }));
    connectReq.on('timeout', () => { connectReq.destroy(); resolve({ status: 'TIMEOUT' }); });
    connectReq.end();
  });
}

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex').substring(0, 16); }

const MODE = process.env.MODE || 'fixed'; // fixed=固定html+js / livehtml=新拉html+固定js

async function runRound(browser, round) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrs.push(m.text().substring(0, 120)); });

  // 收集大脚本（dynCode：eval 生成，url 为空，len > 100000）
  const bigScripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    if (p.length > 100000) bigScripts.push({ scriptId: p.scriptId, length: p.length, url: (p.url || '').substring(0, 80) });
  });

  let htmlBody;
  if (MODE === 'livehtml') {
    const ch = await httpsGet(TARGET);
    if (ch.status !== 412) { await context.close(); return { totalSha: 'ERR:' + ch.status, dyn: [] }; }
    htmlBody = ch.body;
  } else {
    htmlBody = fs.readFileSync(LOCAL_HTML, 'utf8');
  }
  const jsBody = fs.readFileSync(LOCAL_JS, 'utf8');
  await page.route('**/*', async (route) => {
    const req = route.request();
    const rt = req.resourceType();
    if (rt === 'document') {
      route.fulfill({ status: 412, contentType: 'text/html', body: htmlBody });
    } else if (rt === 'script') {
      route.fulfill({ status: 200, contentType: 'application/javascript', body: jsBody });
    } else {
      route.continue().catch(() => {});
    }
  });

  await page.goto(TARGET, { timeout: 40000, waitUntil: 'commit' }).catch(() => {});
  await new Promise(r => setTimeout(r, 32000));

  // 取大脚本源码
  const dyn = [];
  for (const s of bigScripts) {
    try {
      const r = await cdp.send('Debugger.getScriptSource', { scriptId: s.scriptId });
      const src = r.scriptSource || '';
      dyn.push({ length: s.length, url: s.url, sha: sha(src) });
    } catch (e) {}
  }
  console.log(`[R${round}] 大脚本数: ${bigScripts.length}`);
  dyn.forEach((d, i) => console.log(`  #${i} len=${d.length} url=${d.url || '(eval)'} sha=${d.sha}`));
  const h = crypto.createHash('sha256');
  for (const d of dyn) h.update(d.sha + '|');
  const totalSha = h.digest('hex').substring(0, 16);
  console.log(`[R${round}] dynCode 组合哈希: ${totalSha}`);

  // 抓 P cookie 对比
  const cookies = await context.cookies();
  const p = cookies.filter(c => /^P$/.test(c.name));
  console.log(`[R${round}] P cookie:`, p.map(c => c.value.substring(0, 60) + '...len=' + c.value.length));
  console.log(`[R${round}] 页面 URL:`, page.url().substring(0, 80));
  if (consoleErrs.length) console.log(`[R${round}] console 错误 ${consoleErrs.length} 条, 前3:`, consoleErrs.slice(0, 3).join(' || '));
  else console.log(`[R${round}] console 无错误`);

  await context.close();
  return { totalSha, dyn };
}

(async () => {
  // 保存一份真实 412 html（含 nsd/cd）
  if (!fs.existsSync(LOCAL_HTML)) {
    const ch = await httpsGet(TARGET);
    if (ch.status !== 412) { console.log('无法获取 412 html, status=', ch.status); process.exit(1); }
    fs.writeFileSync(LOCAL_HTML, ch.body);
    const m = ch.body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    console.log('已保存 412 html, nsd=' + (m ? m[1] : '?') + ' cd长度=' + (m ? m[2].length : '?'));
  } else {
    const body = fs.readFileSync(LOCAL_HTML, 'utf8');
    const m = body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
    console.log('复用本地 html, nsd=' + (m ? m[1] : '?') + ' cd长度=' + (m ? m[2].length : '?'));
  }

  const browser = await chromium.launch({ headless: true, proxy: { server: 'http://36.134.44.6:2018', username: '74940609', password: 'aFmWc5Fs' }, args: ['--ignore-certificate-errors', '--no-sandbox'] });

  const r1 = await runRound(browser, 1);
  console.log('=== 第二轮（完全相同的固定资源）===');
  const r2 = await runRound(browser, 2);

  console.log('\n=== 对比 ===');
  console.log('dynCode 哈希一致:', r1.totalSha === r2.totalSha ? '★★★ 是！固定资源 → dynCode 确定，静态分析可靠' : '否（仍有动态性）');
  if (r1.totalSha !== r2.totalSha) {
    r1.dyn.forEach((d, i) => {
      console.log(`R1 #${i}: len=${d.length} sha=${d.sha}`);
      console.log(`R2 #${i}: len=${r2.dyn[i] ? r2.dyn[i].length : '?'} sha=${r2.dyn[i] ? r2.dyn[i].sha : '?'}`);
    });
  }
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
