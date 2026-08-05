// hook sdenv 中 l__ → _$iJ 主分发器，观察调用参数（可能含 offset/keys）
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
  // fn = function _$nD(){var _$lx=[256];push(arguments);return _$iJ.apply(this,_$lx);}
  // hook 通过 Function.prototype.apply 拦截
  const origApply = Function.prototype.apply;
  const calls = [];
  Function.prototype.apply = function (thisArg, argsArr) {
    if (calls.length < 20 && this && this.name && this.name.startsWith('_$i')) {
      calls.push({ name: this.name, argsLen: argsArr ? argsArr.length : 0, arg0: argsArr && argsArr[0] !== undefined ? String(argsArr[0]).substring(0, 30) : 'none' });
    }
    return origApply.call(this, thisArg, argsArr);
  };
  // 触发 l__（模拟浏览器调用链）
  try { fn('test'); } catch (e) {}
  // 输出 hook 结果
  console.log('_$i 调用记录:');
  calls.forEach((c, i) => console.log(`  [${i}] ${c.name} argsLen=${c.argsLen} arg0=${c.arg0}`));
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
