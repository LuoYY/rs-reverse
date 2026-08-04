// 确定性分析 v2：固定 nsd/cd 跑两次，对比 cookie 稳定段 vs 变化段
// 手动构造 sdenv 环境 + 手动设置 $_ts（固定 nsd/cd）+ 手动执行外层 JS
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

async function genCookieOnce(nsd, cd) {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const { window, cookieJar } = dom;
  // 覆盖为固定 nsd/cd（保持挑战页其他环境不变）
  window.$_ts.nsd = nsd;
  window.$_ts.cd = cd;
  // 等待 cookie 生成（内层 JS 由定时器驱动）
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const c = cookieJar.getCookieStringSync(B + '/');
      if (c.includes('O=') && c.includes('P=') || Date.now() - t0 > 30000) {
        clearInterval(iv);
        resolve(c);
      }
    }, 500);
  });
  window.close();
  return cookies;
}

(async () => {
  console.log('=== 确定性分析 v2（固定 nsd/cd）===');
  // 第一次拉取拿真实 nsd/cd
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('固定 nsd:', nsd, 'cd_len:', cd.length);

  console.log('\n[第1次]...');
  const c1 = await genCookieOnce(nsd, cd);
  console.log('[第2次]...');
  const c2 = await genCookieOnce(nsd, cd);

  console.log('\ncookie1:', c1.substring(0, 120));
  console.log('cookie2:', c2.substring(0, 120));
  console.log('\nc1 len:', c1.length, 'c2 len:', c2.length);
  console.log('完全一致:', c1 === c2);

  // 按 ; 分割对比 O/P
  const p1 = c1.split(';').map(s => s.trim());
  const p2 = c2.split(';').map(s => s.trim());
  for (let i = 0; i < p1.length; i++) {
    const name = p1[i].split('=')[0];
    const v1 = p1[i].split('=')[1] || '';
    const v2 = p2[i] ? p2[i].split('=')[1] || '' : '';
    console.log(`\n${name}: ${v1.length} vs ${v2.length} 字符, 相同=${v1 === v2}`);
    if (v1 !== v2) {
      // 找第一个差异位置
      let d = 0;
      while (d < v1.length && d < v2.length && v1[d] === v2[d]) d++;
      console.log(`  首个差异 @${d}: ...${v1.substring(Math.max(0, d - 20), d + 20)}...`);
      console.log(`               ...${v2.substring(Math.max(0, d - 20), d + 20)}...`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
