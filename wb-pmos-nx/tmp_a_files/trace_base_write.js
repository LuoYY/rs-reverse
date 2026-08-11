// 插桩：捕获 base 数组（59 头）的索引赋值写入点
// 方法：hook Array.prototype 的关键索引写路径，sdenv 内 base 用索引赋值构造
// 用 Proxy 代理捕获所有数组的 [i]=v 写操作，只记录长度 140-200 的候选
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';
const OUT = path.join(__dirname, 'nx_base_writes.json');

(async () => {
  console.log('[TW] pid=%d start', process.pid);
  const writes = []; // {idx, val, len, head, stack}
  let arrCount = 0;
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: SDENV_PROXY,
    consoleConfig: { error: new Function() },
    beforeParse(window) {
      const w = window;
      // 拦截所有新数组的创建，用 Proxy 包装（仅监控大数组写入）
      const wrap = (a) => {
        arrCount++;
        return new Proxy(a, {
          set(target, prop, value) {
            if (typeof prop === 'string' && /^\d+$/.test(prop)) {
              const i = +prop;
              // 追踪长度到 140+ 的数组
              if (target.length >= 140 || i >= 140) {
                const snapshot = Array.from(target.slice(0, 4));
                writes.push({ idx: i, val: value, len: target.length + (i >= target.length ? 1 : 0), head: snapshot.join(','), stack: new Error().stack.split('\n').slice(2, 6).join('|') });
                if (writes.length > 5000) writes.splice(0, 1000);
              }
            }
            return Reflect.set(target, prop, value);
          }
        });
      };
      // hook Array 构造结果（new Array(len) / [..] / Array.prototype.push 后）
      const OArr = w.Array;
      // 1) new Array(len) 大数组
      try { w.Array = new Proxy(OArr, { construct(T, args) { const a = Reflect.construct(T, args); return args.length && args[0] >= 140 ? wrap(a) : a; } }); } catch (e) { console.log('[TW] Array construct hook fail:', e.message); }
      // 2) push 到 140+ 的数组（逐步构造）
      try {
        const opush = OArr.prototype.push;
        OArr.prototype.push = function () {
          const r = opush.apply(this, arguments);
          if (this.length >= 140 && this.length <= 200) {
            writes.push({ idx: 'push', val: arguments[0], len: this.length, head: Array.from(this.slice(0, 4)).join(','), stack: new Error().stack.split('\n').slice(2, 6).join('|') });
          }
          return r;
        };
      } catch (e) {}
    },
  });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      const c = dom.cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(); }
      lastLen = pLen;
      if (Date.now() - t0 > 35000) { clearInterval(iv); resolve(); }
    }, 300);
  });
  console.log('[TW] arrCount=' + arrCount + ' writes=' + writes.length);
  // 找 59 头写入
  const candidates = writes.filter(w2 => w2.head === '59,148,7,120' || w2.head === '59,148,7');
  console.log('[TW] 59头写入数: ' + candidates.length);
  candidates.slice(0, 30).forEach((c, i) => console.log('[TW] #' + i + ' idx=' + c.idx + ' val=' + c.val + ' len=' + c.len + ' stack=' + c.stack));
  // 也看 push 到 59 头的
  const pushCands = writes.filter(w2 => w2.idx === 'push' && w2.len >= 150);
  console.log('[TW] 150+ push 数: ' + pushCands.length);
  pushCands.slice(0, 15).forEach((c, i) => console.log('[TW] P#' + i + ' len=' + c.len + ' head=' + c.head + ' val=' + c.val + ' stack=' + c.stack));
  fs.writeFileSync(OUT, JSON.stringify({ writes, candidates, pushCands }, null, 1));
  console.log('[TW] saved ' + OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TW] FATAL:', e && e.message); process.exit(1); });
