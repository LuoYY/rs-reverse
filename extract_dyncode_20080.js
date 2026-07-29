/**
 * Phase B — 在 Node 中执行外层 VM，提取与浏览器一致的动态代码 + cp[3]
 *
 * 原理：外层 VM 的 _$_C 是纯计算（LCG + shuffle + globalText 字符串处理），
 * 不依赖浏览器指纹。补最小 window/document/$_ts 环境 + hook eval，
 * 即可拿到与浏览器逐字节一致的动态代码（含正确的 keyname 多轮 shuffle）。
 *
 * 用法：
 *   NODE_OPTIONS=--dns-result-order=ipv4first node extract_dyncode_20080.js <ts.json>
 *   ts.json 需含 { nsd, cd, from, keynameNum }
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const OUT_DIR = path.join(__dirname, 'output', 'capture-20080');
const OUTER_JS = path.join(__dirname, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function checksum(code) { let s = 0; for (let i = 0; i < code.length; i += 100) s += code.charCodeAt(i); return s; }

/**
 * 在最小沙箱中执行外层 VM，捕获动态代码
 * @param {object} ts { nsd, cd }
 * @param {string} outerJsCode 外层 VM 源码（443/20080 字节码相同，可复用本地文件）
 * @returns {{ dynCode, cp3, cookies, ts }}
 */
function runOuterVM(ts, outerJsCode) {
  const captured = { dynCodes: [], cookies: [], evals: [] };

  // 最小 window/document 环境（外层 VM 只读取少量属性 + eval + cookie）
  const document = {
    _cookie: '',
    get cookie() { return this._cookie; },
    set cookie(v) { captured.cookies.push(v); this._cookie = this._cookie ? this._cookie + '; ' + v : v; },
    createElement: () => ({ style: {}, setAttribute: () => {}, getElementsByTagName: () => [] }),
    getElementsByTagName: () => [],
    documentElement: { style: {} },
    body: { appendChild: () => {}, },
    hidden: false,
  };
  const navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    appName: 'Netscape',
    appVersion: '5.0',
    language: 'zh-CN',
  };
  const screen = { width: 1680, height: 1050, availWidth: 1680, availHeight: 1025, colorDepth: 24 };
  const location = { href: 'https://pmos.xj.sgcc.com.cn:20080/', pathname: '/', hostname: 'pmos.xj.sgcc.com.cn', protocol: 'https:', reload: () => {}, replace: () => {} };

  const sandbox = {
    console,
    document,
    navigator,
    screen,
    location,
    Math, Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, escape, unescape,
    setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
    setInterval: () => 0, clearInterval: () => {}, clearTimeout: () => {},
    // $_ts 种子
    $_ts: { nsd: ts.nsd, cd: ts.cd },
  };
  // window 自引用
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  // eval：捕获动态代码（瑞数经 _$g6=_$at.eval; _$g6.call(_$at, code) 执行）
  const realEval = (code) => {
    if (typeof code === 'string') {
      captured.evals.push(code.length);
      if (code.length > 50000) captured.dynCodes.push(code);
    }
    // 不真正执行内层 VM（只取动态代码 + cp3）
    return undefined;
  };
  sandbox.eval = realEval;
  // window.eval 引用（_$at.eval）
  sandbox.window.eval = realEval;

  vm.createContext(sandbox);
  try {
    vm.runInContext(outerJsCode, sandbox, { timeout: 30000 });
  } catch (e) {
    // 外层 VM 可能因缺环境抛错，但动态代码通常已生成
    captured.error = e.message;
  }
  // 内层动态代码 = 最大的一段
  const dynCode = captured.dynCodes.slice().sort((a, b) => b.length - a.length)[0];
  return {
    dynCode,
    cp3: dynCode ? checksum(dynCode) : null,
    dynLen: dynCode && dynCode.length,
    cookies: captured.cookies,
    evals: captured.evals,
    error: captured.error,
    $_ts: sandbox.$_ts,
  };
}

// ---- main ----
async function main() {
  const tsPath = process.argv[2] || path.join(OUT_DIR, 'pipeline-ts.json');
  const ts = JSON.parse(fs.readFileSync(tsPath, 'utf8'));
  console.log('[extract] nsd=', ts.nsd, 'cd_len=', ts.cd && ts.cd.length);

  let outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  // 若 ts 来自 :20080，外层 js 字节码与 443 相同（已验证 dJ[1] 一致），可用本地 443 js
  const result = runOuterVM(ts, outerJsCode);
  console.log('[extract] evals:', result.evals.length, 'dyn>50K:', result.dynCodes.length);
  console.log('[extract] 动态代码 len=', result.dynLen, 'cp3=', result.cp3);
  if (result.error) console.log('[extract] 沙箱错误(可能可忽略):', result.error);
  console.log('[extract] cookie 写入:', result.cookies.length, '条');

  if (result.dynCode) {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'extracted-dyn-code.js'), result.dynCode);
    fs.writeFileSync(path.join(OUT_DIR, 'extracted-info.json'), JSON.stringify({
      nsd: ts.nsd, cp3: result.cp3, dynLen: result.dynLen, cookies: result.cookies,
    }, null, 2));
    console.log('[extract] ✓ 已保存到', OUT_DIR);
  }
}

module.exports = { runOuterVM };

if (require.main === module) {
  main().catch(e => { console.error('FATAL:', e); process.exit(1); });
}
