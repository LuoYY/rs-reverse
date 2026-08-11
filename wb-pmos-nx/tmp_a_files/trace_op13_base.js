// 源码级插桩：修改 dynCode 的 op=13 分支（_$m$[_$$q[81]]=_$$w），
// 检测 _$m$ 是否为 59 头 base 数组（长度 140-200 且 [0]=59），记录每次写入
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SDENV_PROXY = 'http://ericshi:583315@120.221.249.98:2018';
const OUT = path.join(__dirname, 'nx_op13_base.json');

(async () => {
  console.log('[T13] pid=%d start', process.pid);
  let patched = false;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    try {
      if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !patched) {
        patched = true;
        console.log('[T13] 截获 dynCode len=' + code.length);
        let c = code;
        // 插桩 op=13 写入分支：变量名每次会话随机，用正则匹配
        // 模式：if(_$pW===13){<var>[<idx>]=<val>;}  → 在 { 后注入检测
        const old13 = /if\(_\$pW===13\)\{([_$a-zA-Z][_$a-zA-Z0-9]*)\[([_$a-zA-Z][_$a-zA-Z0-9]*)\[81\]\]=([_$a-zA-Z][_$a-zA-Z0-9]*);\}/;
        const m13 = c.match(old13);
        if (m13) {
          const arrVar = m13[1], idxVar = m13[2], valVar = m13[3];
          const new13 = `if(_$pW===13){try{if(${arrVar}&&${arrVar}.length>=140&&${arrVar}.length<=200&&${arrVar}[0]===59){globalThis.__bw=globalThis.__bw||[];globalThis.__bw.push({i:${idxVar}[81],v:${valVar},len:${arrVar}.length});if(globalThis.__bw.length>20000)globalThis.__bw.splice(0,5000);}}catch(__e){if(!globalThis.__bwE)globalThis.__bwE=String(__e);}${arrVar}[${idxVar}[81]]=${valVar};}`;
          c = c.replace(old13, new13);
          console.log('[T13] op13 插桩 OK (arr=' + arrVar + ' idx=' + idxVar + ' val=' + valVar + ')');
        } else { console.log('[T13] ✗ op13 模式未找到'); }
        // 尾部完成标记
        c = c.replace(/\}\)\$_ts\.scj,\$_ts\.aebi\);\s*$/, ';globalThis.__T13DONE=true;}(_$ts.scj,_$ts.aebi);');
        c = c.replace(/\}\)\(_ts\.scj,_ts\.aebi\);\s*$/, ';globalThis.__T13DONE=true;}(_ts.scj,_ts.aebi);');
        fs.writeFileSync(path.join(__dirname, 'nx_dynCode_op13_patched.js'), c);
        code = c;
      }
    } catch (e) { console.log('[T13] hook err:', e.message); }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA, proxy: SDENV_PROXY, consoleConfig: { error: new Function() },
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
  const n = ev('typeof __bw!=="undefined"?__bw.length:0');
  console.log('[T13] __bw 条数:', n);
  const err = ev('typeof __bwE!=="undefined"?__bwE:null');
  console.log('[T13] __bwE:', err);
  const done = ev('typeof __T13DONE!=="undefined"?__T13DONE:null');
  console.log('[T13] DONE:', done);
  const head = ev('typeof __bw!=="undefined"?JSON.stringify(__bw.slice(0,50)):null');
  console.log('[T13] head:', head);
  const tail = ev('typeof __bw!=="undefined"?JSON.stringify(__bw.slice(-60)):null');
  console.log('[T13] tail:', tail);
  // 完整保存
  const full = ev('typeof __bw!=="undefined"?JSON.stringify(__bw):null');
  if (full) fs.writeFileSync(OUT, full);
  console.log('[T13] saved', OUT);
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[T13] FATAL:', e && e.message); process.exit(1); });
