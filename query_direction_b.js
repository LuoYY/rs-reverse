/**
 * query_direction_b.js — 方向B: 浏览器内 Array.prototype.join 条件断点
 *
 * 通过代理在浏览器中加载页面
 * 用 addInitScript 安装 join hook
 * 捕获 query 编码前的字节数组
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== 方向B: 浏览器 join 条件断点 ===\n');

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  // 安装 join hook（在 RS 加载前）
  await context.addInitScript(() => {
    window.__joinResults = [];
    window.__fromCharCodeResults = [];
    window.__concatResults = [];

    // Hook Array.prototype.join
    const origJoin = Array.prototype.join;
    Array.prototype.join = function(sep) {
      const result = origJoin.call(this, sep);
      // 捕获以 '0' 开头的编码结果（query 和 cookie 都以 '0' 开头）
      if (typeof result === 'string' && result.length > 40 && result[0] === '0') {
        // 检查 this 是否是字节数组
        let allBytes = this.length > 0;
        for (let i = 0; i < Math.min(this.length, 5); i++) {
          if (typeof this[i] !== 'number' || this[i] < 0 || this[i] > 255) { allBytes = false; break; }
        }
        if (allBytes) {
          window.__joinResults.push({
            result: result.substring(0, 200),
            arrLen: this.length,
            sep: String(sep).substring(0, 5),
            arrHead: Array.from(this).slice(0, 20),
            time: Date.now(),
          });
        }
      }
      return result;
    };

    // Hook String.fromCharCode（批量调用）
    const origFCC = String.fromCharCode;
    String.fromCharCode = function() {
      const result = origFCC.apply(null, arguments);
      if (arguments.length > 20 && result.length > 20) {
        window.__fromCharCodeResults.push({
          result: result.substring(0, 200),
          len: arguments.length,
          codes: Array.from(arguments).slice(0, 20),
          time: Date.now(),
        });
      }
      return result;
    };

    // Hook Array.prototype.concat（可能用于拼接加密结果）
    const origConcat = Array.prototype.concat;
    Array.prototype.concat = function() {
      const result = origConcat.apply(this, arguments);
      if (result.length === 88 || result.length === 48 || result.length === 32) {
        let allBytes = true;
        for (let i = 0; i < Math.min(result.length, 5); i++) {
          if (typeof result[i] !== 'number' || result[i] < 0 || result[i] > 255) { allBytes = false; break; }
        }
        if (allBytes) {
          window.__concatResults.push({
            resultLen: result.length,
            data: Array.from(result).slice(0, 30),
            time: Date.now(),
          });
        }
      }
      return result;
    };

    console.log('[Hook] join + fromCharCode + concat hooks installed');
  });

  // 捕获 query
  const capturedQueries = [];
  let browserNsd = null, browserCd = null;
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  const page = await context.newPage();
  page.on('response', async resp => {
    if (resp.status() === 412 && !browserNsd) {
      const body = await resp.text().catch(() => '');
      const m = body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (m) { browserNsd = +m[1]; browserCd = m[2]; }
    }
  });

  console.log('加载页面...');
  await page.goto(TARGET, { timeout: 120000 }).catch(e => console.log('goto:', e.message.substring(0, 40)));
  await page.waitForTimeout(5000);
  console.log(`nsd: ${browserNsd}`);

  console.log('Reload...');
  await page.reload({ timeout: 120000 }).catch(e => console.log('reload:', e.message.substring(0, 40)));
  await page.waitForTimeout(15000);

  console.log(`\nQueries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => console.log(`  [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`));

  // 收集 hook 数据
  const hookData = await page.evaluate(() => ({
    joinResults: window.__joinResults || [],
    fromCharCodeResults: (window.__fromCharCodeResults || []).slice(-30),
    concatResults: window.__concatResults || [],
  })).catch(() => ({ joinResults: [], fromCharCodeResults: [], concatResults: [] }));

  console.log(`\nJoin results: ${hookData.joinResults.length}`);
  hookData.joinResults.slice(0, 10).forEach((s, i) => {
    console.log(`  [${i}] arrLen=${s.arrLen} sep="${s.sep}" result="${s.result.substring(0, 80)}"`);
    console.log(`       arrHead=[${s.arrHead.join(',')}]`);
  });

  console.log(`\nFromCharCode results: ${hookData.fromCharCodeResults.length}`);
  hookData.fromCharCodeResults.slice(0, 5).forEach((s, i) => {
    console.log(`  [${i}] len=${s.len} result="${s.result.substring(0, 60)}"`);
  });

  console.log(`\nConcat results: ${hookData.concatResults.length}`);
  hookData.concatResults.forEach((s, i) => {
    console.log(`  [${i}] len=${s.resultLen} data=[${s.data.join(',')}]`);
  });

  // 匹配 query
  if (capturedQueries.length > 0 && hookData.joinResults.length > 0) {
    console.log('\n=== 匹配 query ===');
    const qVal = capturedQueries[0].query;
    hookData.joinResults.forEach((s, i) => {
      // query 值以 '0' 开头
      if (s.result.startsWith(qVal.substring(0, 15))) {
        console.log(`*** Join[${i}] matches query! ***`);
        console.log(`  Full result: ${s.result}`);
        console.log(`  Array length: ${s.arrLen}`);
        console.log(`  Separator: "${s.sep}"`);
        console.log(`  Array head: [${s.arrHead.join(',')}]`);
      }
    });
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-direction-b.json'),
    JSON.stringify({
      nsd: browserNsd, cd: browserCd,
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      joinResults: hookData.joinResults,
      fromCharCodeResults: hookData.fromCharCodeResults,
      concatResults: hookData.concatResults,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\n结果已保存');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
