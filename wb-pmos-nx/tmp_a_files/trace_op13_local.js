// 本地固定版本（127.0.0.1:8080）下 op13 插桩：变量名固定，捕获 base 数组完整写入序列
// 目标：定位 [78:90] 的写入时刻与输入源（keys 派生 vs 常量池 vs 环境）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LOCAL_PROXY = 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, 'nx_op13_local.json');

(async () => {
  console.log('[TL] pid=%d start', process.pid);
  const origRun = vm.runInContext;
  let patched = false;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('while(1)') >= 0 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[TL] ★ 截获 dynCode len=' + code.length);
        let c = code;
        // 本地固定版本下变量名固定：op13 = if(_$pW===13){_$m$[_$$q[81]]=_$$w;}
        const op13Full = 'if(_$pW===13){_$m$[_$$q[81]]=_$$w;}';
        const inject = `if(_$pW===13){try{if(_$m$&&_$m$.length>=140&&_$m$.length<=210){globalThis.__bw=globalThis.__bw||[];if(_$m$[0]===59)globalThis.__bw.push({i:_$$q[81],v:_$$w,len:_$m$.length});if(globalThis.__bw.length>5000)globalThis.__bw.splice(0,2500);}}catch(__e){if(!globalThis.__bwE)globalThis.__bwE=String(__e);}`;
        if (c.indexOf(op13Full) >= 0) {
          c = c.split(op13Full).join(inject + '_$m$[_$$q[81]]=_$$w;}');
          console.log('[TL] op13 精确插桩 OK');
        } else {
          // 尝试匹配（可能有缩进/分号差异）
          const m13 = c.match(/if\(_\$pW===13\)\{_\$m\$_\[_\$\$q\[81\]\]=_\$\$w;\}/);
          console.log('[TL] op13 regex:', m13 ? 'match' : 'none');
          if (m13) c = c.replace(m13[0], inject + '_$m$[_$$q[81]]=_$$w;}');
        }
        // 尾部标记：_)($_ts.scj,$_ts.aebi);
        const tailMark = '})($_ts.scj,$_ts.aebi);';
        if (c.indexOf(tailMark) >= 0) {
          c = c.split(tailMark).join(';globalThis.__TLDONE=true;})($_ts.scj,$_ts.aebi);');
          console.log('[TL] 尾部标记 OK');
        } else { console.log('[TL] ✗ 尾部标记未找到'); }
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_op13_local_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[TL] hook err:', e.message); }
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
  console.log('[TL] DONE:', ev('typeof __TLDONE!=="undefined"?__TLDONE:null'));
  console.log('[TL] P len:', (dom.cookieJar.getCookieStringSync(B + '/').match(/P=[^;]*/) || [''])[0].length);
  const n = ev('typeof __bw!=="undefined"?__bw.length:0');
  console.log('[TL] __bw 条数:', n);
  console.log('[TL] err:', ev('typeof __bwE!=="undefined"?__bwE:null'));
  const head = ev('typeof __bw!=="undefined"?JSON.stringify(__bw.slice(0,30)):null');
  console.log('[TL] head:', head);
  const tail = ev('typeof __bw!=="undefined"?JSON.stringify(__bw.slice(-100)):null');
  console.log('[TL] tail:', tail);
  const full = ev('typeof __bw!=="undefined"?JSON.stringify(__bw):null');
  if (full) fs.writeFileSync(OUT, full);
  console.log('[TL] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[TL] FATAL:', e && e.message); process.exit(1); });
