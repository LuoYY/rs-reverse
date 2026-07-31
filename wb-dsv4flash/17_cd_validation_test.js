/**
 * 17_cd_validation_test.js
 *
 * 决定性测试：用捕获的浏览器 cd 跑管线生成 cookie 并重放
 *   - 200 → 管线对该 cd 正确，浏览器用的是别的 cd
 *   - 412/400 → 管线对该 cd 推导错误（浏览器 keys 不同）
 *
 * 同时捕获 412 原文，验证 nsd/cd 解析正确性
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');
const OUTER_JS = path.join(__dirname, '../example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function httpGet(pathStr, cookie) {
  return new Promise((resolve) => {
    https.get({ hostname: 'pmos.xj.sgcc.com.cn', port: 20080, path: pathStr, rejectUnauthorized: false, headers: { 'User-Agent': UA, 'Cookie': cookie } }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', e => resolve({ status: 'ERR', body: e.message }));
  });
}

async function runPipeline(nsd, cd) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.join(__dirname, '..'));
  const { runOuterVM } = require('../extract_dyncode_20080.js');
  const outerJs = fs.readFileSync(OUTER_JS, 'utf8');
  const r = runOuterVM({ nsd, cd }, outerJs);
  if (!r.cp3) throw new Error('cp3 failed');
  const gv = require('@src/handler/globalVarible');
  const { getCode } = require('@utils/');
  const tmpTs = '/tmp/pmos-xj-ts6.json';
  fs.writeFileSync(tmpTs, JSON.stringify({ nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 }));
  const argv = { file: tmpTs, jsurls: [OUTER_JS], hasDebug: false, mate: {}, output: path.join(__dirname, '..', 'output'), level: 'warn', _: ['makecookie'] };
  const codeRet = await getCode(argv.jsurls);
  argv.mate = { jscode: codeRet.jscode, metaContent: [], url: undefined };
  gv._setAttr('argv', argv);
  require('@src/config/')(gv);
  const ts = { nsd, cd, from: TARGET, hasDebug: false, keynameNum: 909, cp3Override: r.cp3 };
  gv._setAttr('_ts', ts);
  const Coder = require('@src/handler/Coder');
  const coder = new Coder({ hasCodemap: true, hasDebug: false, ...ts }, gv.config.immucfg);
  const { codemap } = coder.run();
  gv.config.codemap = codemap;
  require('@src/handler/parser/').init(coder);
  // 生成 cookie
  const Cookie = require('@src/handler/Cookie');
  const cookie = new Cookie(coder).run();
  const name = gv.utils.ascii2string(gv.keys[7]).split(';')[5] + (gv.config.adapt?.lastWord || 'T');
  return { cookie, name, keys: gv.keys };
}

async function main() {
  console.log('[1] 启动浏览器捕获 412 原文...');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  let challengeRaw = null;
  page.on('response', async (resp) => {
    if (challengeRaw) return;
    if (resp.status() === 412) {
      try {
        challengeRaw = await resp.text();
        console.log('[412] 捕获 bodyLen=' + challengeRaw.length);
      } catch (e) {}
    }
  });

  console.log('[2] 加载 + reload...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  if (!challengeRaw) { console.log('未捕获 412'); await browser.close(); return; }

  // 用与 pmos_xj_client 相同的正则解析
  const m1 = challengeRaw.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
  console.log('\n[3] 正则1 (pmos_xj_client 式):', m1 ? 'nsd=' + m1[1] + ' cdLen=' + m1[2].length : 'FAIL');
  const m2 = challengeRaw.match(/\$_ts\.nsd\s*=\s*(\d+)[\s\S]*?\$_ts\.cd\s*=\s*"([^"]+)"/);
  console.log('[3b] 正则2 (宽松):', m2 ? 'nsd=' + m2[1] + ' cdLen=' + m2[2].length : 'FAIL');
  // 打印 $_ts 区域
  const tsIdx = challengeRaw.indexOf('$_ts');
  console.log('\n$_ts 区域:');
  console.log(challengeRaw.substring(tsIdx, tsIdx + 300));
  const cookieIdx = challengeRaw.indexOf('document.cookie');
  if (cookieIdx > 0) console.log('\ncookie 区域:', challengeRaw.substring(cookieIdx, cookieIdx + 200));

  const nsd = parseInt(m2[1]);
  const cd = m2[2];

  // 浏览器里提取 keys30
  // 定位 global
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const sendSrc = sendSrcR.result.value;
  const dm = sendSrc.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];
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
  const dSrcR = await cdp.send('Runtime.callFunctionOn', { objectId: dId, functionDeclaration: 'function() { return Function.prototype.toString.call(this); }', returnByValue: true });
  const m32 = dSrcR.result.value.match(/<=32\?[_$\w]+\[[_$\w]+\+\+\s*\]=([_$\w]+)\[/);
  const globalName = m32 ? m32[1] : null;
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });
  let globalId = null;
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === globalName && v.value?.objectId) globalId = v.value.objectId; }
  }
  const keys30R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function(){ var k=this[30]; if(!Array.isArray(k))return null; return JSON.stringify([k[2]&&Array.isArray(k[2])?k[2].slice(0,16):null, k[16]&&Array.isArray(k[16])?k[16].slice(0,16):null, k[17]&&Array.isArray(k[17])?k[17].slice(0,16):null]); }`,
    returnByValue: true,
  });
  const [bk2, bk16, bk17] = JSON.parse(keys30R.result.value);
  console.log('\n[4] 浏览器 keys2 :', (bk2 || []).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('    浏览器 keys16:', (bk16 || []).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('    浏览器 keys17:', (bk17 || []).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 管线生成
  console.log('\n[5] 管线生成 cookie...');
  const oCookie = (await context.cookies()).find(c => c.name.endsWith('O'));
  try {
    const { cookie, name, keys } = await runPipeline(nsd, cd);
    console.log('  cookie:', cookie.substring(0, 30) + '... len=' + cookie.length);
    console.log('  管线 keys17:', keys[17].map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  管线 keys2 :', keys[2].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  keys17 匹配:', keys[17].every((b, i) => b === bk17[i]) ? '★YES' : 'NO');
    console.log('  keys2 匹配:', keys[2].slice(0, 16).every((b, i) => b === bk2[i]) ? '★YES' : 'NO');

    // 重放
    const replay = await httpGet('/', `${oCookie.name}=${oCookie.value}; ${name}=${cookie}`);
    console.log('\n  管线 cookie 重放:', replay.status, '(200=管线正确，412=管线错误)');
  } catch (e) {
    console.log('  管线失败:', e.message.substring(0, 80));
  }

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
