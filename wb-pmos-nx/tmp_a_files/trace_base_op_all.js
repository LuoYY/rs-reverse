// 本地固定版本：插桩所有数组写入 opcode（_$m$/_$ez/_$e5/_$py/_$nE），检测哪个数组变 59 头
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_base_opall.json');

(async () => {
  console.log('[OA] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[OA] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 检测代码里的数组变量名
        const arrVars = ['_$m$', '_$ez', '_$e5', '_$py', '_$nE', '_$bk', '_$k6'];
        const foundVars = arrVars.filter(v => c.indexOf(v) >= 0);
        console.log('[OA] 数组变量:', foundVars.join(','));
        // 插桩策略：在主循环 while(1){ 后注入一个"每 opcode 检测"钩子开销太大。
        // 改为 hook Array 原型的 set（用本地固定环境内的所有数组）—— 但 base 用字面量。
        // 最可靠：注入到 dynCode 顶部，重写 Array.prototype 的 push + 用 Object.defineProperty 劫持 set
        // 但索引赋值无法劫持。换终极方案：hook numarr2string 编码前的 base 数组
        // —— 从 buildCookie 链路看，base 最后被 numarrEncrypt(base) 编码，插桩 numarrEncrypt 输入！
        // 但 dynCode 是自包含的，不含 numarrEncrypt（那是管线函数）。
        // dynCode 内生成 base 后：huffman 编码 → XOR → 写入 nextarr → cookie。
        // 所以找 dynCode 内 huffman 编码函数的输入。
        // 从 FINDINGS：XOR 循环 for(kB=0;kB<iH(1528);kB+=8){ez[kB..]^=pL[..]} 输入是 _$ez
        // 但 base 在编码前。找 "_$ez" 首次被写 59 或类似。
        // 直接注入：hook Array.prototype 的索引定义？不行。
        // ★ 终极方案：hook vm 内所有数组的 length setter + 记录构造时刻
        // 实际上最简单：用 Proxy 包住 eval 前的 Array——但字面量绕不过。
        // 换：在 dynCode 中搜索 "=[59," 字面量（base 头）或 "59," 
        const idx59 = c.indexOf('59,148');
        console.log('[OA] "59,148" 字面量:', idx59 >= 0 ? idx59 : '无（运行时生成）');
        // 找 _$ez 定义
        const ezDef = c.indexOf('_$ez');
        console.log('[OA] _$ez 首次出现 ctx:', c.slice(Math.max(0, ezDef - 80), ezDef + 60));
        code = c;
      }
    } catch (e) { console.log('[OA] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() },
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
  console.log('[OA] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[OA] FATAL:', e && e.message); process.exit(1); });
