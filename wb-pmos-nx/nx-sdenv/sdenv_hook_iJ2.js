// hook sdenv 中所有 _$ 函数调用，抓 offset 相关（U14124020 任务输出 8 字节）
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async () => {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window, sdenv) {
      // hook 所有函数调用：抓返回 8 元素小数组的函数
      const origApply = Function.prototype.apply;
      const origCall = Function.prototype.call;
      window.__hits = [];
      Function.prototype.apply = function (thisArg, argsArr) {
        const r = origApply.call(this, thisArg, argsArr);
        if (window.__hits.length < 30 && Array.isArray(r) && r.length === 8 && r.every(x => typeof x === 'number')) {
          window.__hits.push({ fn: this.name || 'anon', args: argsArr ? Array.from(argsArr).slice(0, 5).map(x => typeof x) : [], ret: r });
        }
        return r;
      };
    },
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 20000));
  const hits = w.__hits || [];
  console.log('8 元素数组返回的调用:', hits.length);
  hits.forEach((h, i) => console.log(`  [${i}] ${h.fn} args=${h.args} ret=${h.ret.join(',')}`));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
