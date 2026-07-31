/**
 * 36_new_context_replay.js
 *
 * 新浏览器 context（全新会话）重放旧 cookie：
 *   1. 读取 multi 捕获的 cookie
 *   2. 新 context 设置 cookie → 访问 → 观察 status
 * 验证：cookie 绑定"浏览器 TLS 环境"还是"原会话"
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  // 读取旧 cookie
  const f = fs.readdirSync(OUT).filter(x => x.startsWith('multi_')).sort().pop();
  const d = JSON.parse(fs.readFileSync(path.join(OUT, f)));
  const oc = d.cookies.find(c => c.name.endsWith('O'));
  const pc = d.cookies.find(c => c.name.endsWith('P'));
  console.log('旧 cookie:', oc.name, 'O=' + oc.value.length + ' P=' + pc.value.length);
  console.log('旧 challenge nsd:', d.challenge ? d.challenge.nsd : '?');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });

  // 测试 1：新 context + 设置旧 cookie
  console.log('\n=== 测试1: 新 context + 旧 cookie ===');
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await ctx.newPage();
    await ctx.addCookies([
      { name: oc.name, value: oc.value, domain: 'pmos.nx.sgcc.com.cn', path: '/' },
      { name: pc.name, value: pc.value, domain: 'pmos.nx.sgcc.com.cn', path: '/' },
    ]);
    const r = await page.goto(TARGET, { timeout: 120000 }).catch(() => null);
    await page.waitForTimeout(5000);
    const status = r ? r.status() : 'ERR';
    console.log('  新 context 访问 →', status);
    // 检查页面是否业务页
    const content = await page.content().catch(() => '');
    console.log('  页面含业务特征:', content.includes('outNet') || content.includes('login') ? 'YES' : 'NO');
    // 触发请求
    const trig = await page.evaluate(`(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`).catch(e => 'ERR');
    console.log('  新 context 业务请求 →', trig);
    await ctx.close();
  }

  // 测试 2：同 context reload（保留会话）
  console.log('\n=== 测试2: 新 context + 旧 cookie + reload ===');
  {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
    const page = await ctx.newPage();
    await ctx.addCookies([
      { name: oc.name, value: oc.value, domain: 'pmos.nx.sgcc.com.cn', path: '/' },
      { name: pc.name, value: pc.value, domain: 'pmos.nx.sgcc.com.cn', path: '/' },
    ]);
    await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(4000);
    // 只 reload（不重新拉挑战）
    const r = await page.reload({ timeout: 120000 }).catch(() => null);
    await page.waitForTimeout(5000);
    const trig = await page.evaluate(`(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`).catch(e => 'ERR');
    console.log('  reload 后业务请求 →', trig);
    await ctx.close();
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
