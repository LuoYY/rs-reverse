// 在 sdenv 完整环境中观察 $_ts 的结构和函数（keys 生成入口）
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async () => {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  // 等执行
  await new Promise(r => setTimeout(r, 15000));
  const ts = w.$_ts;
  console.log('$_ts 存在:', !!ts, '类型:', typeof ts);
  if (ts) {
    const keys = Object.keys(ts);
    console.log('$_ts keys:', keys.join(','));
    for (const k of keys) {
      const v = ts[k];
      console.log(`  ${k}: ${typeof v === 'function' ? 'fn ' + v.name : (Array.isArray(v) ? 'arr ' + v.length : typeof v)}`);
    }
  }
  // 检查 window 其他 keys 属性
  const winKeys = Object.keys(w).filter(k => /_$|ts|l_|cookie/i.test(k)).slice(0, 20);
  console.log('\nwindow 相关 keys:', winKeys.join(','));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
