/**
 * 328_dump_tables.js
 * nx：dump dispatcher 闭包里的函数表（_$a9/_$j$/_$h9/_$o_/_$fe/_$kc），找 query 加密函数
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const { chromium } = require('patchright');

const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://39.91.164.125:2018', username: '74940609', password: 'aFmWc5Fs' };
const OUT = '/tmp/nx_enc_calls';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  try { await page.goto(TARGET, { timeout: 60000, waitUntil: 'domcontentloaded' }); } catch (e) {}
  await page.waitForTimeout(12000);
  console.log('标题:', await page.evaluate(() => document.title).catch(() => '?'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');

  const sendSrcR = await cdp.send('Runtime.evaluate', { expression: 'Function.prototype.toString.call(XMLHttpRequest.prototype.send)', returnByValue: true });
  const src = sendSrcR.result.value;
  const dm = src.match(/([_$\w]+)\(([_$\w]+),0,([_$\w]+)\.([_$\w]+)\.length,([_$\w]+)\)/);
  const dName = dm ? dm[1] : null;
  console.log('dispatcher:', dName);

  const sendObj = await cdp.send('Runtime.evaluate', { expression: 'XMLHttpRequest.prototype.send' });
  const sendProps = await cdp.send('Runtime.getProperties', { objectId: sendObj.result.objectId, ownProperties: true });
  let scopesId;
  for (const ip of (sendProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') scopesId = ip.value.objectId; }
  const scopes = await cdp.send('Runtime.getProperties', { objectId: scopesId, ownProperties: true });
  let dId = null;
  for (const scope of scopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) { if (v.name === dName && v.value?.type === 'function') dId = v.value.objectId; }
  }
  if (!dId) { console.log('未找到 dispatcher'); await browser.close(); process.exit(1); }

  // dump dispatcher 闭包所有变量（含函数表）
  const dispProps = await cdp.send('Runtime.getProperties', { objectId: dId, ownProperties: true });
  let dispScopesId;
  for (const ip of (dispProps.internalProperties || [])) { if (ip.name === '[[Scopes]]') dispScopesId = ip.value.objectId; }
  const dispScopes = await cdp.send('Runtime.getProperties', { objectId: dispScopesId, ownProperties: true });

  // 遍历作用域收集数组/表
  const tables = {};
  for (const scope of dispScopes.result) {
    if (!scope.value?.objectId) continue;
    const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
    for (const v of vars.result) {
      if (!v.value?.objectId) continue;
      const desc = v.value.description || '';
      if (desc.includes('Array')) {
        try {
          const elems = await cdp.send('Runtime.callFunctionOn', { objectId: v.value.objectId, functionDeclaration: `function(){ var n=0,f=0,o=0; for(var i=0;i<Math.min(this.length,300);i++){ var t=typeof this[i]; if(t==='function')f++; else if(t==='object'&&this[i]!==null)o++; else if(t==='number')n++; } return {len:this.length, fn:f, obj:o, num:n}; }`, returnByValue: true });
          if (elems && elems.result && elems.result.value) tables[v.name] = elems.result.value;
        } catch (e) {}
      }
    }
  }
  console.log('\n=== dispatcher 闭包数组 ===');
  for (const [name, t] of Object.entries(tables)) {
    console.log(`${name}: len=${t.len} fn=${t.fn} obj=${t.obj} num=${t.num}`);
  }

  // 找含大量函数的表（候选 global），dump 其函数索引 + 源码
  const fnTables = Object.entries(tables).filter(([n, t]) => t.fn > 3);
  console.log('\n=== 含函数表的函数索引 ===');
  for (const [name, t] of fnTables) {
    console.log(`\n--- ${name} ---`);
    // 找到该数组的 objectId
    for (const scope of dispScopes.result) {
      if (!scope.value?.objectId) continue;
      const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
      for (const scope of dispScopes.result) {
        if (!scope.value?.objectId) continue;
        const vars = await cdp.send('Runtime.getProperties', { objectId: scope.value.objectId, ownProperties: true });
        for (const v of vars.result) {
          if (v.name === name && v.value?.objectId) {
            try {
              const dump = await cdp.send('Runtime.callFunctionOn', { objectId: v.value.objectId, functionDeclaration: `function(){
                var out = {};
                for(var i=0;i<Math.min(this.length,260);i++){
                  if(typeof this[i]==='function'){
                    var s = Function.prototype.toString.call(this[i]);
                    out[i] = s.substring(0,90).replace(/\\n/g,' ');
                  } else if(Array.isArray(this[i]) && this[i].length<60 && this[i].length>0){
                    out[i] = 'arr:'+JSON.stringify(this[i]);
                  }
                }
                return out;
              }`, returnByValue: true });
              console.log(JSON.stringify(dump.result.value).substring(0, 1800));
            } catch (e) { console.log('dump 失败:', e.message.substring(0, 60)); }
            break;
          }
        }
      }
    }
  }

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
