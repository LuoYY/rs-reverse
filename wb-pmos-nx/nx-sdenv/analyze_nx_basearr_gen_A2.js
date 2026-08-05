// 方向 A2：在 jsdom 里 hook Function.prototype.call/apply，拦截 VM 分发器内部函数返回，
// 捕获 basearr 明文（首字节 179 的大数组）及其生成函数 stack。
// 依据：B 侧确认 basearr 明文 [0]=179；VM 内部通过 .call/.apply 调度，返回值会经过此 hook。
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = '/tmp/nx_basearr_gen_A2.json';

(async () => {
  console.log('[A2] pid=%d start %s', process.pid, new Date().toISOString());
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      const hits = [];
      const isBytes = (a) => a && a.every(b => typeof b === 'number' && b >= 0 && b <= 255);
      const test = (r, tag, fnName) => {
        if (hits.length >= 60) return;
        let a = null;
        try { a = Array.isArray(r) ? r : (ArrayBuffer.isView(r) ? Array.from(r) : null); } catch (e) {}
        if (!a || !isBytes(a)) return;
        // basearr 明文：首字节 179 且较长；也记录其它以 179 开头数组
        if (a[0] === 179 && a.length >= 60 && a.length <= 400) {
          const st = (new Error()).stack || '';
          hits.push({ tag, fn: fnName, len: a.length, stack: st, data: [...a] });
          console.log('[A2] ★ basearr? len=' + a.length + ' tag=' + tag + ' fn=' + fnName);
        }
      };
      const oCall = Function.prototype.call;
      const oApply = Function.prototype.apply;
      Function.prototype.call = function (t, ...args) {
        const r = oCall.apply(this, [t, ...args]);
        try { test(r, 'call', this && this.name); } catch (e) {}
        return r;
      };
      Function.prototype.apply = function (t, argsArr) {
        const r = oApply.call(this, t, argsArr);
        try { test(r, 'apply', this && this.name); } catch (e) {}
        return r;
      };
      w.__hits = hits;
      w.__restore = () => { Function.prototype.call = oCall; Function.prototype.apply = oApply; };
    },
  });
  const w = dom.window;
  // 等 P cookie 生成（VM 跑完）
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 700);
  });
  const hits = w.__hits || [];
  console.log('[A2] basearr(179) hits=%d', hits.length);
  fs.writeFileSync(OUT, JSON.stringify(hits, null, 1));
  hits.forEach((h, i) => {
    const top = (h.stack || '').split('\n').slice(1, 6).join(' | ');
    console.log(`[A2] hit[${i}] len=${h.len} tag=${h.tag} fn=${h.fn}\n    data[0:24]=${h.data.slice(0, 24).join(',')}\n    stack: ${top}`);
  });
  console.log('[A2] saved %s', OUT);
  try { w.__restore && w.__restore(); } catch (e) {}
  dom.window.close();
  console.log('[A2] done');
  process.exit(0);
})().catch(e => { console.error('[A2] FATAL:', e && e.message); process.exit(1); });
