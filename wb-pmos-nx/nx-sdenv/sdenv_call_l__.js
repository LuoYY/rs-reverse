// 调用 sdenv 中 $_ts.l__ 观察其行为
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
  await new Promise(r => setTimeout(r, 15000));
  const fn = w.$_ts.l__;
  console.log('l__ 类型:', typeof fn, 'name:', fn && fn.name);
  if (typeof fn === 'function') {
    // 尝试调用（可能生成 keys）
    try {
      const r = fn();
      console.log('l__() 返回:', typeof r, Array.isArray(r) ? 'arr len ' + r.length : String(r).substring(0, 60));
    } catch (e) { console.log('l__() 抛错:', e.message); }
    // 尝试 toString 看源码
    const src = Function.prototype.toString.call(fn);
    console.log('l__ 源码(前200):', src.substring(0, 200));
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
