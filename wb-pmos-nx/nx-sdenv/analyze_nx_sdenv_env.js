// 方向 2c：提取 sdenv 的完整环境指纹 + base 生成上下文。
// 目标：弄清 sdenv 环境里 base 的 [0:23] 头 + 中间环境编码段由哪些环境值决定，
// 产出"Go 沙箱需补全的环境清单"（纯算法复现 base 的环境依赖）。
const fs = require('fs');
const { jsdomFromUrl } = require('sdenv');
const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

(async () => {
  console.log('[ENV] pid=%d start', process.pid);
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.221.249.98:2018',
    consoleConfig: { error: new Function() },
  });
  const w = dom.window;
  // 等 VM 跑一阵
  await new Promise(r => setTimeout(r, 6000));
  // 提取环境指纹
  const env = {};
  try {
    const nav = w.navigator;
    env.navigator = {
      userAgent: nav.userAgent, platform: nav.platform, language: nav.language,
      languages: Array.from(nav.languages || []), hardwareConcurrency: nav.hardwareConcurrency,
      maxTouchPoints: nav.maxTouchPoints, vendor: nav.vendor, appVersion: nav.appVersion,
      deviceMemory: nav.deviceMemory, doNotTrack: nav.doNotTrack, cookieEnabled: nav.cookieEnabled,
      plugins: nav.plugins ? nav.plugins.length : 0, mimeTypes: nav.mimeTypes ? nav.mimeTypes.length : 0,
    };
    env.screen = {
      width: w.screen.width, height: w.screen.height, availWidth: w.screen.availWidth, availHeight: w.screen.availHeight,
      colorDepth: w.screen.colorDepth, pixelDepth: w.screen.pixelDepth,
    };
    env.window = {
      innerWidth: w.innerWidth, innerHeight: w.innerHeight, outerWidth: w.outerWidth, outerHeight: w.outerHeight,
      devicePixelRatio: w.devicePixelRatio,
    };
    // canvas 指纹
    try {
      const c = w.document.createElement('canvas'); c.width = 200; c.height = 60;
      const ctx = c.getContext('2d'); ctx.font = '14px Arial'; ctx.fillText('Test123', 5, 20);
      env.canvasDataURL = c.toDataURL();
    } catch (e) { env.canvasDataURL = 'ERR:' + e.message; }
    // WebGL
    try {
      const c2 = w.document.createElement('canvas'); const gl = c2.getContext('webgl');
      env.webglVendor = gl ? gl.getParameter(gl.VENDOR) : 'null';
      env.webglRenderer = gl ? gl.getParameter(gl.RENDERER) : 'null';
    } catch (e) { env.webgl = 'ERR:' + e.message; }
    env.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    env.timezoneOffset = new Date().getTimezoneOffset();
    // 其他瑞数可能检测的
    env.hasChrome = !!w.chrome;
    env.hasCallPhantom = typeof w.callPhantom !== 'undefined';
    env.hasWebdriver = !!w.navigator.webdriver;
    env.hasWorker = typeof w.Worker !== 'undefined';
    env.hasIndexedDB = typeof w.indexedDB !== 'undefined';
    env.hasRTCPeerConnection = typeof w.RTCPeerConnection !== 'undefined';
    env.evalLen = w.eval.toString().length;
  } catch (e) { console.log('[ENV] 提取部分失败:', e.message); }
  console.log('[ENV] 环境指纹:');
  console.log(JSON.stringify(env, null, 1));
  fs.writeFileSync('/tmp/nx_sdenv_env.json', JSON.stringify(env, null, 1));
  console.log('[ENV] saved /tmp/nx_sdenv_env.json done');
  dom.window.close();
  process.exit(0);
})().catch(e => { console.error('[ENV] FATAL:', e && e.message); process.exit(1); });
