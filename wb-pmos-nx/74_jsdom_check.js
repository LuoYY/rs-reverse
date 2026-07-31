/**
 * 74_jsdom_check.js
 * 检查 jsdom 生成的动态代码是否混淆（_$xx vs ā）+ 环境依赖验证
 */
const fs = require('fs');
const path = require('path');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';
const { JSDOM } = require('jsdom');
const OUT = path.join(__dirname, 'captures');

(async () => {
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  // 捕获 eval 代码（但保留原生 toString ？用 defineProperty 不可见？）
  // 直接用 Function.prototype.constructor 捕获？不。用 document.cookie 即可。
  // 我们只检查 window 上生成的函数名
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8'));
  await new Promise(r => setTimeout(r, 10000));

  // 检查全局变量/函数名（_$ vs ā）
  const names = Object.getOwnPropertyNames(window).filter(n => /^[_$āa-z]{1,4}$/i.test(n) && /[_$ā]/.test(n));
  const underscores = names.filter(n => n.includes('_'));
  const aNames = names.filter(n => n.includes('ā'));
  console.log('window 混淆名:', names.length, '个，_$ 类:', underscores.length, 'ā 类:', aNames.length);
  if (aNames.length) console.log('ā 示例:', aNames.slice(0, 8).join(', '));
  if (underscores.length) console.log('_$ 示例:', underscores.slice(0, 8).join(', '));

  // document.cookie
  const cookies = [];
  const desc = Object.getOwnPropertyDescriptor(window.Document.prototype, 'cookie') || Object.getOwnPropertyDescriptor(window.HTMLDocument.prototype, 'cookie');
  try { console.log('document.cookie:', window.document.cookie.substring(0, 80)); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
