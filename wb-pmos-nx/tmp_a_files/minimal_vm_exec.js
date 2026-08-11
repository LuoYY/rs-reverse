// 最小符号执行器：纯 Node vm 执行 dynCode
// 输入：scj/aebi（从本地固定 challenge 捕获）+ $_ts
// 目标：验证无 jsdom 环境下 dynCode 能完整执行（输出 base）
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
  // 1. 用 sdenv 加载（本地固定）捕获真实 scj/aebi/ez
  let capScj = null, capAebi = null, capEz = null;
  const origRun = vm.runInContext;
  vm.runInContext = function (code, ctx, opts) {
    if (typeof code === 'string' && code.length > 400000 && code.indexOf('function _$c4') >= 0 && !capEz) {
      let c = code;
      const retTarget = 'return _$hF.apply(this,_$eS);';
      if (c.indexOf(retTarget) >= 0) {
        const inject = `try{if(globalThis.__ezM===undefined){globalThis.__ezM=true;globalThis.__ezMin=(typeof _$ez!=="undefined")?(Array.isArray(_$ez)?Array.from(_$ez):(typeof _$ez==="string"?Array.from(_$ez).map(function(x){return x.charCodeAt(0);}):null)):null;}}catch(__e){globalThis.__ezME=String(__e);}` + retTarget;
        c = c.split(retTarget).join(inject);
      }
      code = c;
    }
    return origRun(code, ctx, opts);
  };
  const dom = await jsdomFromUrl(B + '/', { userAgent: UA, proxy: LOCAL_PROXY, consoleConfig: { error: new Function() } });
  const w = dom.window;
  await new Promise((resolve) => {
    const t0 = Date.now(); let lastLen = 0;
    const iv = setInterval(() => {
      try {
        if (!capScj && w.$_ts && w.$_ts.scj) { capScj = w.$_ts.scj; capAebi = w.$_ts.aebi; }
        const c = dom.cookieJar.getCookieStringSync(B + '/');
        const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
        if (capScj && pLen > 300) { clearInterval(iv); resolve(); }
        lastLen = pLen;
        if (Date.now() - t0 > 30000) { clearInterval(iv); resolve(); }
      } catch (e) {}
    }, 50);
  });
  try { capEz = w.eval('typeof __ezMin!=="undefined"?__ezMin:null'); } catch (e) {}
  console.log('scj:', typeof capScj, capScj ? JSON.stringify(capScj).slice(0, 80) : 'null');
  console.log('aebi:', typeof capAebi, capAebi ? ('len=' + (capAebi.length)) : 'null');
  console.log('ez:', capEz ? 'len=' + capEz.length : 'null');
  // 保存
  fs.writeFileSync(path.join(__dirname, 'nx_min_inputs.json'), JSON.stringify({ scj: capScj, aebi: capAebi, ez: capEz }));
  dom.window.close();

  // 2. 纯 Node vm 执行 dynCode（用捕获的 scj/aebi）
  if (capScj && capAebi) {
    const dynCode = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files/nx_dynCode_cs_patched.js', 'utf8');
    const sandbox = {
      $_ts: { scj: capScj, aebi: capAebi, nsd: 67402, cd: '' },
      console,
      globalThis: {},
      setTimeout, clearTimeout,
      Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Error, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
      navigator: { userAgent: UA, appVersion: '', platform: 'MacIntel', language: 'zh-CN', languages: ['zh-CN'], cookieEnabled: true, onLine: true, hardwareConcurrency: 8, maxTouchPoints: 0 },
      screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080, colorDepth: 24, pixelDepth: 24 },
      location: { href: B + '/', protocol: 'https:', host: 'pmos.nx.sgcc.com.cn:10443', hostname: 'pmos.nx.sgcc.com.cn', port: '10443', pathname: '/', search: '', hash: '' },
      history: { length: 1 },
      document: { cookie: '', referrer: '', title: '', readyState: 'complete', documentElement: { style: {} }, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, getContext: () => null }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
      window: {},
      self: {},
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window.window = sandbox;
    sandbox.top = sandbox;
    sandbox.parent = sandbox;
    sandbox.frameElement = null;
    sandbox.frames = sandbox;
    vm.createContext(sandbox);
    console.log('\n=== 纯 Node vm 执行 dynCode ===');
    try {
      vm.runInContext(dynCode, sandbox, { timeout: 30000 });
      console.log('执行完成!');
      console.log('_$ts keys:', Object.keys(sandbox.$_ts).join(','));
      console.log('_$ts.cp:', sandbox.$_ts.cp ? JSON.stringify(sandbox.$_ts.cp).slice(0, 100) : 'null');
      // 找 base 输出
      const outs = Object.keys(sandbox).filter(k => k.startsWith('__'));
      console.log('sandbox __ 全局:', outs.join(','));
      console.log('__ezMin:', sandbox.__ezMin ? 'len=' + sandbox.__ezMin.length : 'null');
    } catch (e) {
      console.log('执行失败:', e.message.slice(0, 150));
      if (e.stack) console.log(e.stack.split('\n').slice(0, 3).join('\n'));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e && e.message); process.exit(1); });
