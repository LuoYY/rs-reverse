/**
 * 04_find_global.js
 *
 * 分析 nx 站点 send dispatcher 源码，找出 global 数组的引用方式
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  // 1. send 源码
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const sendSrc = sendSrcR.result.value;
  console.log('=== send 源码 (前 1500) ===');
  console.log(sendSrc.substring(0, 1500));
  console.log('\n=== send 源码长度:', sendSrc.length);

  // 2. 找 dispatcher 调用
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  console.log('\ndispatcher 调用模式:', dm ? dm.slice(0, 6).join(' | ') : '无');
  const dName = dm ? dm[1] : null;

  // 3. 提取 dispatcher 源码
  if (dName) {
    const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
    const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
    let scopesId;
    for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
    const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
    let dId;
    for (const scope of scopes.result) {
      if (!scope.value?.objectId) continue;
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
    }
    if (dId) {
      const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
      const dSrc = dSrcR.result.value;
      console.log('\n=== dispatcher ' + dName + ' 源码长度:', dSrc.length, '===');
      // 找 global 数组特征：长数组的索引写入（如 xxx[yy++]=）
      const writes = [...dSrc.matchAll(/([_$\w]+)\[([_$\w]+)\+\+\s*\]\s*=/g)].map(m => m[1]);
      console.log('数组索引递增写入的数组名:', [...new Set(writes)].join(', '));
      // 找 >255 检查（global 是 909/1151 长度的大数组，可能有最大值检查）
      const bigArr = [...dSrc.matchAll(/([_$\w]+)\.length\s*[,;>)=]/g)].map(m => m[1]);
      console.log('.length 引用的变量:', [...new Set(bigArr)].slice(0, 20).join(', '));
      // dump 前 2500 字符
      console.log('\ndispatcher 前 2500:');
      console.log(dSrc.substring(0, 2500));
      fs.writeFileSync(path.join(OUT, 'dispatcher_src.txt'), dSrc);
      console.log('\n完整 dispatcher 已保存: captures/dispatcher_src.txt');
    } else {
      console.log('未找到 dispatcher 函数对象');
    }
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
