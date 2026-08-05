// 方向 2b：sdenv 插桩——抓 cap（明文 basearr 输入）+ 完整 P cookie，
// 保存同会话 (cd, cap, P) 供离线分析 cap→base 的 VM 加密。
// 关键：cap 能抓到（proto.slice），base 抓不到（JSVMP 内部栈），
// 但 base 可从 P cookie 离线解出 → 得到同会话 cap/base 对，反推 VM 变换。
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT_PREFIX = '/tmp/nx_capbase_';

(async () => {
  const runIdx = process.argv[2] || '0';
  console.log('[CAP] pid=%d run=%s start', process.pid, runIdx);
  const caps = []; // 抓到的 113 头 cap 数组（完整）
  let tsSnap = null;
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.221.249.98:2018',
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      w.__snapTs = () => { try { const t = w.$_ts; if (t && t.cd && !tsSnap) tsSnap = { nsd: t.nsd, cd: String(t.cd) }; } catch (e) { } return !!tsSnap; };
      const rec = (arr) => {
        try {
          const a = Array.from(arr);
          if (a.length >= 140 && a.length <= 210 && a[0] === 113 && a.every(x => typeof x === 'number' && x >= 0 && x <= 255)) {
            const k = a.join(',');
            if (!caps.some(c => c.join(',') === k)) caps.push(a);
          }
        } catch (e) { }
      };
      for (const C of [w.Array, w.Uint8Array]) {
        if (!C || !C.prototype) continue;
        for (const m of ['map', 'slice', 'concat', 'filter', 'flat', 'flatMap', 'subarray']) {
          const o = C.prototype[m]; if (typeof o !== 'function') continue;
          try { C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r }; } catch (e) { }
        }
      }
      try { const of = w.Array.from; w.Array.from = function () { const r = of.apply(this, arguments); rec(r); return r }; } catch (e) { }
    },
  });
  const w = dom.window;
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try { w.__snapTs && w.__snapTs(); } catch (e) { }
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(c); }
    }, 300);
  });
  const P = cookies.split(';').map(s => s.trim()).find(p => /P=/.test(p));
  const pVal = P ? P.split('=')[1] : null;
  console.log('[CAP] cap 抓到 ' + caps.length + ' 个, lens=' + caps.map(c => c.length).join(','));
  console.log('[CAP] cd?', !!tsSnap, 'P?', !!pVal);
  const out = { nsd: tsSnap && tsSnap.nsd, cd: tsSnap && tsSnap.cd, caps, P: pVal };
  fs.writeFileSync(OUT_PREFIX + runIdx + '.json', JSON.stringify(out));
  console.log('[CAP] saved', OUT_PREFIX + runIdx + '.json', 'done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[CAP] FATAL:', e && e.message); process.exit(1); });
