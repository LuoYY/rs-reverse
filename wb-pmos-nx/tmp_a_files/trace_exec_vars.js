// 执行流 + 关键变量追踪：记录每个 opcode 执行时的 $_nE 栈/关键数组
// 目标：还原 base 生成的数据流（哪些 push/pop/操作）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';

(async () => {
  console.log('[TV] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[TV] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 主循环插桩：记录 op + 关键变量（_$nE 栈长、_$k0 头、_$ez）
        const target = 'while(1){_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          const inject = `while(1){_$pW=_$bk[_$g6++];try{globalThis.__tv=globalThis.__tv||[];var __rec={op:_$pW,pc:_$g6-1,ne:typeof _$nE!=="undefined"?_$nE.length:-1,ez:typeof _$ez!=="undefined"&&Array.isArray(_$ez)?_$ez.length:-1,po:typeof _$po!=="undefined"?String(_$po).slice(0,20):"-",bk:typeof _$k0!=="undefined"&&Array.isArray(_$k0)?_$k0.slice(0,2):"-"};globalThis.__tv.push(__rec);if(globalThis.__tv.length>300000){globalThis.__tvDone=globalThis.__tv.length;globalThis.__tv.splice(0,150000);}}catch(e){if(!globalThis.__tvE)globalThis.__tvE=String(e);}`;
          c = c.replace(target, inject);
          console.log('[TV] 主循环插桩 OK');
        }
        fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_tv_patched.js', c);
        code = c;
      }
    } catch (e) { console.log('[TV] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  const len = ev('typeof __tv!=="undefined"?__tv.length:0');
  console.log('[TV] 记录数:', len);
  console.log('[TV] err:', ev('typeof __tvE!=="undefined"?__tvE:null'));
  const head = ev('typeof __tv!=="undefined"?JSON.stringify(__tv.slice(0,30)):null');
  console.log('[TV] head:', head);
  const tail = ev('typeof __tv!=="undefined"?JSON.stringify(__tv.slice(-60)):null');
  console.log('[TV] tail:', tail);
  const full = ev('typeof __tv!=="undefined"?JSON.stringify(__tv):null');
  if (full) fs.writeFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_exec_vars.json', full);
  console.log('[TV] saved');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TV] FATAL:', e && e.message); process.exit(1); });
