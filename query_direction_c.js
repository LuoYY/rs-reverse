/**
 * query_direction_c.js — 方向C: 浏览器 CDP 搜索 AES S-box
 *
 * RS 加密一定使用 AES（cookie 已确认）
 * AES 的 S-box 是固定的 256 字节常量
 * 在动态代码中搜索 S-box 特征值
 *
 * S-box 前 16 字节: 99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118
 * 或逆 S-box: 82,9,106,213,48,54,165,56,191,10,53,197,247,51,134,4
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== 方向C: CDP 搜索 AES S-box ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  // 收集所有脚本
  const scripts = {};
  client.on('Debugger.scriptParsed', (e) => { scripts[e.scriptId] = { url: e.url || '' }; });

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  console.log('加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`Scripts: ${Object.keys(scripts).length}`);

  // 搜索 AES S-box 特征
  // S-box 特征值: [99,124,119,123,242] 或逆 S-box [82,9,106,213,48]
  // 在动态代码中，S-box 可能以数组字面量或编码字符串形式出现
  console.log('\n搜索 AES S-box 特征...');

  // 搜索所有脚本中的 S-box 特征
  const sboxPatterns = [
    '99,124,119,123,242',  // S-box 前 5 字节
    '82,9,106,213,48',     // 逆 S-box 前 5 字节
    '63,124,119,123,242',  // 变体
    '0x63,0x7c,0x77,0x7b', // hex 形式
    'c,|,w,{,ò',           // charCode 形式
  ];

  for (const [scriptId, info] of Object.entries(scripts)) {
    if (!info.url && scriptId !== '1') { // 只搜索 eval 的脚本
      try {
        for (const pattern of sboxPatterns) {
          const result = await client.send('Debugger.searchInContent', {
            scriptId: scriptId,
            query: pattern,
            caseSensitive: false,
          });
          if (result.result && result.result.length > 0) {
            console.log(`*** FOUND "${pattern}" in script ${scriptId} ***`);
            result.result.forEach(r => console.log(`  Line ${r.lineNumber}: ${r.lineContent?.substring(0, 80)}`));
          }
        }
      } catch (e) {}
    }
  }

  // 也搜索 encryptMode1/encryptMode2 的特征
  // encryptMode1 调用 getCfg，getCfg 调用 combine4
  // combine4 将 16 字节转为 4 uint32
  console.log('\n搜索加密函数特征...');
  const cryptoPatterns = [
    'getCfg', 'combine4', 'modeEncrypt', 'encryptMode',
    'numarr2string', 'numarrEncrypt', 'numarrJoin',
    'createCipher', 'createDecipher',
  ];

  for (const [scriptId, info] of Object.entries(scripts)) {
    if (!info.url) {
      for (const pattern of cryptoPatterns) {
        try {
          const result = await client.send('Debugger.searchInContent', {
            scriptId: scriptId,
            query: pattern,
            caseSensitive: false,
          });
          if (result.result && result.result.length > 0) {
            console.log(`  "${pattern}" in script ${scriptId}: ${result.result.length} matches`);
          }
        } catch (e) {}
      }
    }
  }

  // Reload 捕获 query
  console.log('\nReload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`Queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => console.log(`  [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`));

  // 关键：用 Runtime.evaluate 在浏览器中直接检查加密相关变量
  if (capturedQueries.length > 0) {
    console.log('\n=== 浏览器内加密函数检查 ===');

    // 检查 window 上是否有加密相关函数
    const cryptoCheck = await page.evaluate(() => {
      const results = {};

      // 检查 $_ts
      const ts = window.$_ts || {};
      results.tsKeys = Object.keys(ts);

      // 检查 $_ts.l__
      if (typeof ts.l__ === 'function') {
        results.l__Src = ts.l__.toString().substring(0, 150);
      }

      // 检查 window 上的所有函数
      results.functions = [];
      for (const k of Object.getOwnPropertyNames(window)) {
        try {
          const v = window[k];
          if (typeof v === 'function' && k.length < 20 && !k.startsWith('on')) {
            const src = v.toString();
            // 检查是否包含加密相关代码
            if (src.includes('charCodeAt') && src.includes('fromCharCode') && src.length > 100 && src.length < 2000) {
              results.functions.push({ name: k, len: src.length, snippet: src.substring(0, 100) });
            }
          }
        } catch (e) {}
      }

      return results;
    }).catch(() => null);

    if (cryptoCheck) {
      console.log('$_ts keys:', cryptoCheck.tsKeys);
      console.log('$_ts.l__:', cryptoCheck.l__Src);
      console.log(`Crypto-like functions: ${cryptoCheck.functions?.length || 0}`);
      cryptoCheck.functions?.slice(0, 5).forEach(f => {
        console.log(`  ${f.name} (${f.len} chars): ${f.snippet}`);
      });
    }

    // 检查 XHR prototype 上的自定义属性
    const xhrCheck = await page.evaluate(() => {
      const proto = XMLHttpRequest.prototype;
      const props = Object.getOwnPropertyNames(proto);
      const custom = {};

      for (const p of props) {
        const desc = Object.getOwnPropertyDescriptor(proto, p);
        if (desc && desc.value && typeof desc.value === 'function') {
          const src = desc.value.toString();
          if (!src.includes('[native code]')) {
            custom[p] = src.substring(0, 100);
          }
        }
        // 也检查 getter/setter
        if (desc && (desc.get || desc.set)) {
          custom[p] = { get: desc.get ? 'getter' : null, set: desc.set ? 'setter' : null };
        }
      }

      return { totalProps: props.length, customProps: custom };
    }).catch(() => null);

    if (xhrCheck) {
      console.log(`\nXHR prototype: ${xhrCheck.totalProps} props, ${Object.keys(xhrCheck.customProps).length} custom`);
      for (const [k, v] of Object.entries(xhrCheck.customProps)) {
        console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      }
    }
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-direction-c.json'),
    JSON.stringify({
      queries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
