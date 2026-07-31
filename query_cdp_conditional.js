/**
 * query_cdp_conditional.js — 方向4: CDP 条件断点捕获 query 生成
 *
 * 在浏览器中 RS 正常生成 query。
 * 用 CDP Debugger.setBreakpointOnFunctionCall 在关键函数上设断点。
 * 条件断点：只在特定条件满足时暂停。
 *
 * 策略：
 * 1. Patchright 加载页面（412→cookie→reload→200）
 * 2. 用 CDP 在 Array.prototype.push 上设条件断点
 *    条件：arguments[0] 是 88 元素的数组（query pre-encoding 大小）
 * 3. 当 RS 构建 query 数据时，断点触发
 * 4. 检查调用栈和局部变量，找到加密密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs'), path = require('path');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== 方向4: CDP 条件断点捕获 query 生成 ===\n');

  // 配置代理
  const PROXY = 'http://74940609:aFmWc5Fs@140.249.234.175:2022';

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: PROXY },
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Debugger.enable');
  await client.send('Runtime.enable');

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) capturedQueries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  // Step 1: 加载页面
  console.log('[Step 1] 加载页面（通过代理）...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Step 2: 在 Array.prototype.join 上设条件断点
  // RS 用 numarr2string 编码 query，内部用 join 拼接字符串
  // 当 join 的结果长度 > 50 且以 '0' 开头时，可能是 query 编码
  console.log('\n[Step 2] 设置条件断点...');

  // 方法1: 在 Array.prototype.push 上设条件断点
  // RS 构建 88 字节 query 数据时会 push 字节到数组
  const pushResult = await client.send('Runtime.evaluate', {
    expression: 'Array.prototype.push',
  });

  if (pushResult.result.objectId) {
    try {
      // 设置条件断点：当 push 的参数是数字且数组长度接近 88 时暂停
      const bp = await client.send('Debugger.setBreakpointOnFunctionCall', {
        objectId: pushResult.result.objectId,
        // 条件：无法在 setBreakpointOnFunctionCall 上设条件
        // 改用普通断点，在 paused 事件中检查条件
      });
      console.log('Push breakpoint:', bp.breakpointId);
    } catch (e) {
      console.log('Push breakpoint error:', e.message.substring(0, 80));
    }
  }

  // 方法2: 用 addInitScript 安装轻量 hook
  // 只捕获长度为 88 的字节数组（query pre-encoding 大小）
  console.log('\n安装轻量 hook（只捕获 88 字节数组）...');
  await context.addInitScript(() => {
    window.__capturedArrays = [];
    window.__capturedStrings = [];

    // Hook Array.prototype.join — RS 用 join 拼接编码字符串
    const origJoin = Array.prototype.join;
    Array.prototype.join = function(sep) {
      const result = origJoin.call(this, sep);
      // 检查是否是 query 编码结果（以 '0' 开头，长度 > 50）
      if (typeof result === 'string' && result.length > 50 && result[0] === '0') {
        window.__capturedStrings.push({
          type: 'join',
          sep: String(sep),
          result: result.substring(0, 120),
          arrLen: this.length,
          time: Date.now(),
        });
      }
      return result;
    };

    // Hook String.fromCharCode — RS 用它构造编码字符串
    const origFromCharCode = String.fromCharCode;
    let fromCharCodeBuffer = [];
    String.fromCharCode = function() {
      const result = origFromCharCode.apply(null, arguments);
      if (arguments.length > 10) {
        // 大批量 fromCharCode 调用，可能是编码
        fromCharCodeBuffer.push({
          codes: Array.from(arguments).slice(0, 20),
          result: result.substring(0, 80),
          len: arguments.length,
          time: Date.now(),
        });
        if (fromCharCodeBuffer.length > 100) fromCharCodeBuffer.shift();
      }
      return result;
    };

    // 暴露 buffer
    window.__fromCharCodeBuffer = fromCharCodeBuffer;

    // Hook 只捕获 88 元素数组
    const origSlice = Array.prototype.slice;
    Array.prototype.slice = function(start, end) {
      const result = origSlice.call(this, start, end);
      if (result.length === 88) {
        // 检查是否全是字节（0-255）
        let allBytes = true;
        for (let i = 0; i < result.length; i++) {
          if (typeof result[i] !== 'number' || result[i] < 0 || result[i] > 255) {
            allBytes = false;
            break;
          }
        }
        if (allBytes) {
          window.__capturedArrays.push({
            type: 'slice88',
            data: Array.from(result),
            time: Date.now(),
          });
        }
      }
      return result;
    };

    // Hook Array.from — 也可能创建 88 元素数组
    const origFrom = Array.from;
    Array.from = function(iterable) {
      const result = origFrom.call(this, iterable);
      if (result.length === 88) {
        let allBytes = true;
        for (let i = 0; i < result.length; i++) {
          if (typeof result[i] !== 'number' || result[i] < 0 || result[i] > 255) {
            allBytes = false;
            break;
          }
        }
        if (allBytes) {
          window.__capturedArrays.push({
            type: 'from88',
            data: Array.from(result),
            time: Date.now(),
          });
        }
      }
      return result;
    };

    console.log('[Hook] Lightweight hooks installed');
  });

  // Step 3: Reload 触发 query 生成
  console.log('\n[Step 3] Reload 触发 API...');
  await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`\nCaptured queries: ${capturedQueries.length}`);
  capturedQueries.slice(0, 3).forEach((q, i) => {
    console.log(`  [${i}] ${q.method} ${q.path} query=${q.query.substring(0, 40)}...`);
  });

  // Step 4: 收集 hook 数据
  console.log('\n[Step 4] 收集 hook 数据...');
  const hookData = await page.evaluate(() => {
    return {
      capturedArrays: window.__capturedArrays || [],
      capturedStrings: window.__capturedStrings || [],
      fromCharCodeBuffer: (window.__fromCharCodeBuffer || []).slice(-20),
    };
  }).catch(() => ({ capturedArrays: [], capturedStrings: [], fromCharCodeBuffer: [] }));

  console.log(`\nCaptured 88-byte arrays: ${hookData.capturedArrays.length}`);
  hookData.capturedArrays.slice(0, 5).forEach((a, i) => {
    console.log(`  [${i}] type=${a.type} data=[${a.data.slice(0, 10).join(',')}...] time=${a.time}`);
  });

  console.log(`\nCaptured strings (join): ${hookData.capturedStrings.length}`);
  hookData.capturedStrings.slice(0, 10).forEach((s, i) => {
    console.log(`  [${i}] sep="${s.sep}" arrLen=${s.arrLen} result="${s.result.substring(0, 60)}"`);
  });

  console.log(`\nFromCharCode buffer: ${hookData.fromCharCodeBuffer.length}`);
  hookData.fromCharCodeBuffer.slice(0, 5).forEach((c, i) => {
    console.log(`  [${i}] len=${c.len} result="${c.result.substring(0, 60)}"`);
  });

  // Step 5: 如果捕获到 88 字节数组，尝试匹配 query
  if (hookData.capturedArrays.length > 0 && capturedQueries.length > 0) {
    console.log('\n[Step 5] 匹配 88 字节数组与 query...');

    // 解码 query
    const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
    const idxmap = {};
    basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

    function decodeQuery(queryStr) {
      const payload = queryStr.startsWith('0') ? queryStr.slice(1) : queryStr;
      const bytes = [];
      let i = 0;
      const full = Math.floor(payload.length / 4);
      for (let g = 0; g < full; g++) {
        const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
        i += 4; bytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
      }
      const rem = payload.length - i;
      if (rem === 2) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
      else if (rem === 3) bytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4), ((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));
      return bytes;
    }

    const queryBytes = decodeQuery(capturedQueries[0].query);
    console.log(`Query decoded: ${queryBytes.length} bytes`);

    // 检查哪个捕获的数组与 query 匹配
    hookData.capturedArrays.forEach((arr, i) => {
      const match = JSON.stringify(arr.data) === JSON.stringify(queryBytes);
      console.log(`  Array[${i}] (${arr.type}): ${match ? '*** MATCH ***' : 'no match'} (first 5: [${arr.data.slice(0, 5).join(',')}])`);

      if (!match) {
        // 检查部分匹配
        let partialMatch = 0;
        for (let j = 0; j < Math.min(arr.data.length, queryBytes.length); j++) {
          if (arr.data[j] === queryBytes[j]) partialMatch++;
        }
        console.log(`    Partial match: ${partialMatch}/${Math.min(arr.data.length, queryBytes.length)} bytes`);
      }
    });
  }

  // Step 6: 如果捕获到 join 字符串，检查是否是 query
  if (hookData.capturedStrings.length > 0 && capturedQueries.length > 0) {
    console.log('\n[Step 6] 检查 join 字符串是否是 query...');
    const queryVal = capturedQueries[0].query;
    hookData.capturedStrings.forEach((s, i) => {
      if (s.result.includes(queryVal.substring(0, 20))) {
        console.log(`  *** String[${i}] matches query! ***`);
        console.log(`    Full result: ${s.result}`);
        console.log(`    Separator: "${s.sep}"`);
        console.log(`    Array length: ${s.arrLen}`);
      }
    });
  }

  // 保存结果
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-cdp-conditional.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      capturedArrays: hookData.capturedArrays,
      capturedStrings: hookData.capturedStrings,
      fromCharCodeBuffer: hookData.fromCharCodeBuffer,
    }, null, 2)
  );
  console.log('\n结果已保存');

  await browser.close();
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
