// 捕获外层 VM basearr：hook Uint8Array 构造 + Array 索引填充 + fill/set
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  const all = [];
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      window.__cap = all;
      // hook Uint8Array 构造（长度 80-500）
      const OrigU8 = window.Uint8Array;
      function U8(arr) {
        const r = new OrigU8(arr);
        if (r.length >= 80 && r.length <= 500 && all.length < 30) {
          try { if (Array.from(r).every(b => b >= 0 && b <= 255)) all.push({ type: 'u8', len: r.length, data: Array.from(r) }); } catch (e) {}
        }
        return r;
      }
      U8.prototype = OrigU8.prototype;
      U8.BYTES_PER_ELEMENT = 1;
      window.Uint8Array = U8;
      // hook Array 的 fill
      const origFill = window.Array.prototype.fill;
      window.Array.prototype.fill = function () {
        const r = origFill.apply(this, arguments);
        if (this.length >= 80 && this.length <= 500 && all.length < 30) {
          try { if (this.every(b => typeof b === 'number' && b >= 0 && b <= 255)) all.push({ type: 'fill', len: this.length, data: [...this] }); } catch (e) {}
        }
        return r;
      };
    },
  });
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
  console.log('捕获数:', all.length);
  all.forEach((b, i) => console.log(`[${i}] ${b.type} len=${b.len}: ${b.data.slice(0, 20).join(',')}...`));
  const max = all.sort((a, b) => b.len - a.len)[0];
  if (max) { fs.writeFileSync('/tmp/nx_basearr_captured.json', JSON.stringify(max.data)); console.log('保存 len=' + max.len); }
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
