/**
 * 关键基准测试：真实浏览器（Patchright）连续加载 :20080 N 次，
 * 统计真实浏览器每次生成 cookie 后 reload 的 200 通过率。
 *
 * 这决定了 100% 通过率是否可达：
 * - 若浏览器也非 100% → 概率校验是服务端固有机制，纯算法无法突破，重试即最优解
 * - 若浏览器 100% → 管线还有未还原的字段，值得继续攻
 *
 * 用法：NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node test_browser_passrate.js [N]
 */
const { chromium } = require('patchright');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const N = parseInt(process.argv[2] || '8', 10);
  let firstTry200 = 0;
  const retryCounts = [];
  for (let i = 0; i < N; i++) {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA });
    const page = await context.newPage();
    let statuses = [];
    page.on('response', (resp) => {
      try { if (resp.url() === TARGET || resp.url() === TARGET.replace(/\/$/, '')) statuses.push(resp.status()); } catch (e) {}
    });
    await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
    // 等待瑞数 reload 完成（最多 8s）
    let finalOk = false;
    for (let w = 0; w < 16; w++) {
      await page.waitForTimeout(500);
      const cookies = await context.cookies();
      const hasP = cookies.some(c => c.name.endsWith('P'));
      const title = await page.title().catch(() => '');
      if (hasP && statuses.includes(200)) { finalOk = true; break; }
      if (hasP && w > 4) { finalOk = statuses.includes(200); break; }
    }
    await browser.close();
    const n412 = statuses.filter(s => s === 412).length;
    const n200 = statuses.filter(s => s === 200).length;
    const firstTry = statuses[0] === 200 || (n412 <= 1 && n200 >= 1);
    if (finalOk && n412 <= 1) firstTry200++;
    retryCounts.push(n412);
    console.log(`#${i + 1}: 状态序列=${statuses.join('→')} (412×${n412}, 200×${n200}) ${finalOk ? '最终200' : '未200'} ${n412 <= 1 && finalOk ? '← 一次通过' : '← 多次重试'}`);
  }
  console.log(`\n===== 真实浏览器基准: ${firstTry200}/${N} 一次通过 =====`);
  console.log(`平均 412 次数: ${(retryCounts.reduce((a, b) => a + b, 0) / retryCounts.length).toFixed(1)}`);
  console.log(firstTry200 >= N * 0.9 ? '→ 浏览器近 100%，管线有未还原字段，值得继续攻' : '→ 浏览器也非 100%，概率校验是服务端固有，重试即最优');
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
