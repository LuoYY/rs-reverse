/**
 * 05_find_global2.js
 *
 * 定位 nx 站点 global 数组（更稳健方法）：
 *   遍历 send dispatcher 的 [[Scopes]]，找长度 >= 500 的大数组（keynameNum=1151）
 *   同时检查 [_$\w]+\[reg++]= 的写入模式确认
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

  // send dispatcher: _$fA
  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const dm = sendSrcR.result.value.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm[1];  // _$fA
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
  console.log('dispatcher:', dName, 'id:', !!dId);

  // 遍历 dispatcher 闭包，找大数组
  const dProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dScopesId;
  for (const ip of (dProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dScopesId = ip.value.objectId; }
  const dScopes = await cdp.send('Runtime.getProperties', { objectId: dScopesId, ownProperties: true });
  console.log('\n=== 按变量名 _$fW 定位 global ===');
  let globalId = null, globalName = null;
  // 遍历所有 scope 层，找名为 _$fW 的变量
  for (const scope of dScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (v.name === '_$fW' && v.value?.objectId) {
        const desc = v.value.description || '';
        console.log('  找到 _$fW:', desc);
        globalId = v.value.objectId; globalName = '_$fW';
      }
    }
  }
  // 兜底：找 length>=1000 的数组
  if (!globalId) {
    console.log('  未直接找到 _$fW，扫描大数组...');
    for (const scope of dScopes.result) {
      if (!scope.value?.objectId) continue;
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      for (const v of vars.result) {
        if (!v.value?.objectId) continue;
        const desc = v.value.description || '';
        if (/Array\((\d{4,})\)/.test(desc)) {
          console.log('  大数组 ' + v.name + ' ' + desc);
          globalId = v.value.objectId; globalName = v.name;
        }
      }
    }
  }
  console.log('global:', globalName, globalId ? '✓' : '✗');
  if (!globalId) { await browser.close(); return; }

  // 读 keys30
  const keys30R = await cdp.send('Runtime.callFunctionOn', {
    objectId: globalId,
    functionDeclaration: `function() {
      var idx30 = this[30];
      if (!Array.isArray(idx30)) return 'null';
      return JSON.stringify(idx30.map(function(k) {
        if (Array.isArray(k)) return { t: 'arr', len: k.length, d: k.slice(0, 64) };
        return { t: typeof k, v: typeof k === 'string' ? k.substring(0, 300) : k };
      }));
    }`,
    returnByValue: true,
  });
  const keys30 = JSON.parse(keys30R.result.value);
  console.log('keys[2]:', keys30[2] ? ('len=' + keys30[2].len + ' ' + keys30[2].d.map(b => b.toString(16).padStart(2, '0')).join(' ')) : 'null');
  console.log('keys[16]:', keys30[16] ? ('len=' + keys30[16].len + ' ' + keys30[16].d.map(b => b.toString(16).padStart(2, '0')).join(' ')) : 'null');
  console.log('keys[17]:', keys30[17] ? ('len=' + keys30[17].len + ' ' + keys30[17].d.map(b => b.toString(16).padStart(2, '0')).join(' ')) : 'null');
  console.log('keys[7]:', keys30[7] ? JSON.stringify(keys30[7].v || keys30[7]) : 'null');

  // cookies
  const cookies = await context.cookies();
  console.log('\ncookies:');
  cookies.forEach(c => console.log('  ' + c.name + ' len=' + c.value.length));

  // 保存 globalId 供后续使用
  fs.writeFileSync(path.join(OUT, 'global_ref.json'), JSON.stringify({
    globalName, challenge: null,
    keys16: keys30[16]?.d || null,
    keys17: keys30[17]?.d || null,
    keys2: keys30[2]?.d || null,
    cookies: cookies.map(c => ({ name: c.name, value: c.value })),
  }, null, 2));
  console.log('\n已保存 captures/global_ref.json');

  await browser.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
