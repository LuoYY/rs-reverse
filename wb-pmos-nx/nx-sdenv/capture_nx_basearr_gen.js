// 在 sdenv 里捕获外层 VM 生成的 basearr 数组（hook Array.push 大数组）
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      // hook Array.push 捕获 50-500 字节全数字数组（basearr 候选）
      const big = window.__big = [];
      const origPush = window.Array.prototype.push;
      window.Array.prototype.push = function () {
        const r = origPush.apply(this, arguments);
        if (this.length >= 80 && this.length <= 500 && big.length < 20) {
          try {
            if (this.every(b => typeof b === 'number' && b >= 0 && b <= 255)) {
              big.push({ len: this.length, data: [...this] });
            }
          } catch (e) {}
        }
        return r;
      };
      // 也 hook concat/slice
      const origConcat = window.Array.prototype.concat;
      window.Array.prototype.concat = function () {
        const r = origConcat.apply(this, arguments);
        if (r.length >= 80 && r.length <= 500 && big.length < 20) {
          try {
            if (r.every(b => typeof b === 'number' && b >= 0 && b <= 255)) {
              big.push({ len: r.length, data: [...r] });
            }
          } catch (e) {}
        }
        return r;
      };
    },
  });
  // 等 cookie 生成
  await new Promise((resolve) => {
    const t0 = Date.now();
    let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 40000) { clearInterval(iv); resolve(); }
    }, 800);
  });
  const big = dom.window.__big || [];
  console.log('捕获大数组数:', big.length);
  big.forEach((b, i) => {
    console.log(`\n[${i}] len=${b.len}: ${b.data.slice(0, 30).join(',')}...`);
  });
  // 保存最大的（最可能是 basearr）
  const max = big.sort((a, b) => b.len - a.len)[0];
  if (max) {
    fs.writeFileSync('/tmp/nx_basearr_captured.json', JSON.stringify(max.data));
    console.log('\n已保存最大数组 /tmp/nx_basearr_captured.json len=' + max.len);
  }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
