// 终极：主循环插桩，快照所有 c4 作用域变量（在 XOR 循环前捕获 base 数组）
// 关键：找到 huffman 编码的输入数组（即 base）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_all_regs.json');

(async () => {
  console.log('[RG] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && !patched) {
        patched = true;
        console.log('[RG] ★ 截获 dynCode len=' + code.length);
        let c = code;
        const target = '_$pW=_$bk[_$g6++];';
        if (c.indexOf(target) >= 0) {
          // 检测所有 var 声明的数组变量（在 c4 函数体内）
          const vars = new Set();
          const varDecls = c.match(/var ([_\$a-zA-Z0-9]+),/g);
          // 更精确：c4 函数参数和局部变量
          const c4Body = c.indexOf('function _$c4');
          const c4End = c4Body >= 0 ? c.indexOf('\nfunction ', c4Body) : -1;
          const body = c4Body >= 0 ? c.substring(c4Body, c4End > 0 ? c4End : c4Body + 20000) : c;
          const allVars = body.match(/([_\$a-zA-Z0-9]+)\s*[,)=;[]/g);
          if (allVars) allVars.forEach(v => vars.add(v.replace(/[^_\$a-zA-Z0-9]/g, '')));
          const varList = [...vars].filter(v => v.length <= 4 && v.includes('_')).slice(0, 30);
          console.log('[RG] 候选变量:', varList.join(','));
          // 插桩：XOR 循环前（op=611 首次出现前）快照所有数组
          const inject = `_$pW=_$bk[_$g6++];try{if(_$pW===611&&!globalThis.__snapDone){globalThis.__snapDone=true;var __regs={};${varList.map(v => `try{if(typeof ${v}!=="undefined"){var __rv=${v};if(Array.isArray(__rv)&&__rv.length>=130&&__rv.length<=250){__regs["${v}"]={len:__rv.length,head:Array.from(__rv.slice(0,10))};}else if(typeof __rv==="string"&&__rv.length>=130){__regs["${v}"]={t:"s",len:__rv.length,head:Array.from(__rv.slice(0,10)).map(function(x){return x.charCodeAt(0);})};}}}catch(__e){}}`).join('')}globalThis.__regSnap=JSON.stringify(__regs);}}catch(e){if(!globalThis.__rgE)globalThis.__rgE=String(e);}`;
          c = c.split(target).join(inject);
          console.log('[RG] 插桩 OK');
        } else { console.log('[RG] ✗ 主循环模式未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_rg_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[RG] hook err:', e.message); }
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
  const ev = (e) => { try { return w.eval(e); } catch (e2) { return 'ERR:' + e2.message; } };
  console.log('[RG] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  console.log('[RG] err:', ev('typeof __rgE!=="undefined"?__rgE:null'));
  const snap = ev('typeof __regSnap!=="undefined"?__regSnap:null');
  console.log('[RG] snap:', snap ? snap.slice(0, 1200) : 'none');
  if (snap) fs.writeFileSync(OUT, snap);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[RG] FATAL:', e && e.message); process.exit(1); });
