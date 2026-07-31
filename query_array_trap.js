/**
 * query_array_trap.js — P2: 数组陷阱在浏览器中捕获 query 加密中间值
 *
 * RS 伪装了 prototype.open 为 [native code]，无法直接检查。
 * 但 RS 生成 query 时会操作字节数组（密钥、明文、密文）。
 * 用 addInitScript 在 RS 加载前安装 Array.prototype hook。
 *
 * 策略：
 * 1. addInitScript 安装数组陷阱（RS 代码执行前）
 * 2. 页面加载 → RS 生成 cookie + hook XHR
 * 3. reload → 业务代码发 XHR → RS 生成 query
 * 4. 陷阱捕获 16/32/48 字节数组
 * 5. 分析捕获的数组，找到 query 的加密密钥
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');

  console.log('=== P2: 数组陷阱捕获 query 加密中间值 ===\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  // 安装数组陷阱（在 RS 代码执行前）
  await context.addInitScript(() => {
    // 陷阱存储
    window.__trappedArrays = [];
    window.__trappedStrings = [];
    window.__queryGenerated = false;

    // 记录时间戳用于排序
    let trapCounter = 0;

    function isByteArray(arr) {
      if (!arr || arr.length < 4) return false;
      for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] !== 'number' || arr[i] < 0 || arr[i] > 255) return false;
      }
      return true;
    }

    function trapArray(arr, source) {
      if (!isByteArray(arr)) return arr;
      const len = arr.length;
      // 只捕获关键长度
      if (len === 16 || len === 17 || len === 32 || len === 48 || len === 88 || len === 24 || len === 4 || len === 8) {
        window.__trappedArrays.push({
          id: trapCounter++,
          len: len,
          data: Array.from(arr),
          source: source,
          time: Date.now(),
        });
      }
      return arr;
    }

    // Hook Array.prototype.slice
    const origSlice = Array.prototype.slice;
    Array.prototype.slice = function(start, end) {
      const result = origSlice.call(this, start, end);
      trapArray(result, 'slice');
      return result;
    };

    // Hook Array.from
    const origFrom = Array.from;
    Array.from = function(iterable, mapper) {
      const result = origFrom.call(this, iterable, mapper);
      trapArray(result, 'from');
      return result;
    };

    // Hook Array.prototype.map
    const origMap = Array.prototype.map;
    Array.prototype.map = function(fn) {
      const result = origMap.call(this, fn);
      trapArray(result, 'map');
      return result;
    };

    // Hook Array.prototype.concat
    const origConcat = Array.prototype.concat;
    Array.prototype.concat = function(...args) {
      const result = origConcat.apply(this, args);
      trapArray(result, 'concat');
      return result;
    };

    // Hook String.fromCharCode (RS 构造字符串)
    const origFromCharCode = String.fromCharCode;
    let charCodeBuffer = [];
    String.fromCharCode = function(...codes) {
      // 捕获多字符调用（可能是字符串构造）
      if (codes.length > 4) {
        const str = origFromCharCode.apply(null, codes);
        if (str.length > 4) {
          window.__trappedStrings.push({
            id: trapCounter++,
            str: str.substring(0, 100),
            codes: codes.slice(0, 20),
            len: codes.length,
            source: 'fromCharCode',
            time: Date.now(),
          });
        }
        return str;
      }
      return origFromCharCode.apply(null, codes);
    };

    // Hook String.prototype.split (RS 可能用 split 处理 URL/cookie)
    const origSplit = String.prototype.split;
    String.prototype.split = function(sep) {
      const result = origSplit.call(this, sep);
      if (this.length > 10 && result.length > 1) {
        const str = String(this);
        if (str.includes('r20SZOQm') || str.includes('aoU85Lxl9xxN') || str.includes('?') || str.includes('=')) {
          window.__trappedStrings.push({
            id: trapCounter++,
            str: str.substring(0, 100),
            sep: String(sep),
            parts: result.length,
            source: 'split',
            time: Date.now(),
          });
        }
      }
      return result;
    };

    // Hook Array.prototype.join (拼接 query 字符串)
    const origJoin = Array.prototype.join;
    Array.prototype.join = function(sep) {
      const result = origJoin.call(this, sep);
      if (result && result.length > 10 && (result.includes('r20SZOQm') || result.includes('aoU85Lxl9xxN'))) {
        window.__trappedStrings.push({
          id: trapCounter++,
          str: result.substring(0, 200),
          sep: String(sep),
          source: 'join',
          time: Date.now(),
        });
        window.__queryGenerated = true;
      }
      return result;
    };

    console.log('[Trap] Array/String hooks installed');
  });

  const page = await context.newPage();

  // 捕获 query
  const capturedQueries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) {
        capturedQueries.push({
          method: req.method(),
          path: new URL(url).pathname,
          query: m[1],
        });
      }
    }
  });

  // Step 1: 加载页面
  console.log('[Step 1] 加载页面...');
  await page.goto(TARGET, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Step 2: Reload 触发 query 生成
  console.log('[Step 2] Reload...');
  await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(10000);

  console.log(`  Captured queries: ${capturedQueries.length}`);

  // Step 3: 收集陷阱数据
  console.log('\n[Step 3] 收集陷阱数据...');
  const trapData = await page.evaluate(() => {
    return {
      arrays: window.__trappedArrays || [],
      strings: window.__trappedStrings || [],
      queryGenerated: window.__queryGenerated || false,
    };
  }).catch(e => {
    console.log('  Evaluate error:', e.message);
    return { arrays: [], strings: [], queryGenerated: false };
  });

  console.log(`  Trapped arrays: ${trapData.arrays.length}`);
  console.log(`  Trapped strings: ${trapData.strings.length}`);
  console.log(`  Query generated: ${trapData.queryGenerated}`);

  // Step 4: 分析捕获的数组
  console.log('\n[Step 4] 分析捕获的数组...');

  // 按长度分组
  const byLen = {};
  for (const a of trapData.arrays) {
    if (!byLen[a.len]) byLen[a.len] = [];
    byLen[a.len].push(a);
  }

  console.log('\n  Arrays by length:');
  for (const [len, arrs] of Object.entries(byLen).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`    ${len}B: ${arrs.length} arrays`);
    // 显示前 3 个
    arrs.slice(0, 3).forEach(a => {
      console.log(`      [${a.id}] src=${a.source} data=[${a.data.slice(0, 16).join(',')}${a.data.length > 16 ? '...' : ''}]`);
    });
  }

  // 特别关注 16 字节数组（可能是 AES 密钥）
  const arrays16 = byLen[16] || [];
  console.log(`\n  16-byte arrays (potential AES keys): ${arrays16.length}`);
  // 去重
  const unique16 = [];
  const seen16 = new Set();
  for (const a of arrays16) {
    const key = a.data.join(',');
    if (!seen16.has(key)) {
      seen16.add(key);
      unique16.push(a);
    }
  }
  console.log(`  Unique 16-byte arrays: ${unique16.length}`);
  unique16.slice(0, 10).forEach(a => {
    console.log(`    [${a.id}] src=${a.source} data=[${a.data.join(',')}]`);
  });

  // 特别关注 32 字节数组（可能是 AES-256 密钥或 2 个 block）
  const arrays32 = byLen[32] || [];
  console.log(`\n  32-byte arrays: ${arrays32.length}`);
  const unique32 = [];
  const seen32 = new Set();
  for (const a of arrays32) {
    const key = a.data.join(',');
    if (!seen32.has(key)) {
      seen32.add(key);
      unique32.push(a);
    }
  }
  console.log(`  Unique 32-byte arrays: ${unique32.length}`);
  unique32.slice(0, 10).forEach(a => {
    console.log(`    [${a.id}] src=${a.source} data=[${a.data.slice(0, 16).join(',')},${a.data.slice(16).join(',')}]`);
  });

  // 48 字节数组（可能是 session_data）
  const arrays48 = byLen[48] || [];
  console.log(`\n  48-byte arrays: ${arrays48.length}`);
  const unique48 = [];
  const seen48 = new Set();
  for (const a of arrays48) {
    const key = a.data.join(',');
    if (!seen48.has(key)) {
      seen48.add(key);
      unique48.push(a);
    }
  }
  console.log(`  Unique 48-byte arrays: ${unique48.length}`);
  unique48.slice(0, 5).forEach(a => {
    console.log(`    [${a.id}] src=${a.source} data=[${a.data.slice(0, 16).join(',')},...,${a.data.slice(32).join(',')}]`);
  });

  // 88 字节数组（可能是完整 query 数据）
  const arrays88 = byLen[88] || [];
  console.log(`\n  88-byte arrays: ${arrays88.length}`);
  arrays88.slice(0, 3).forEach(a => {
    console.log(`    [${a.id}] src=${a.source} data=[${a.data.slice(0, 16).join(',')},...,${a.data.slice(72).join(',')}]`);
  });

  // Step 5: 分析捕获的字符串
  console.log('\n[Step 5] 分析捕获的字符串...');
  const queryStrings = trapData.strings.filter(s => s.str.includes('r20SZOQm'));
  console.log(`  Query-related strings: ${queryStrings.length}`);
  queryStrings.slice(0, 5).forEach(s => {
    console.log(`    [${s.id}] src=${s.source} str=${s.str.substring(0, 100)}`);
  });

  // Step 6: 尝试用捕获的 16 字节数组解密 query
  console.log('\n[Step 6] 尝试用捕获的数组解密 query...');
  if (capturedQueries.length > 0 && unique16.length > 0) {
    const query = capturedQueries[0].query;
    // 解码 query
    const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
    const idxmap = {};
    basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const payload = query.startsWith('0') ? query.slice(1) : query;
    const queryBytes = [];
    let i = 0;
    const full = Math.floor(payload.length / 4);
    for (let g = 0; g < full; g++) {
      const c0 = idxmap[payload[i]], c1 = idxmap[payload[i+1]], c2 = idxmap[payload[i+2]], c3 = idxmap[payload[i+3]];
      i += 4; queryBytes.push((c0<<2)|(c1>>4), ((c1&15)<<4)|(c2>>2), ((c2&3)<<6)|c3);
    }
    const rem = payload.length - i;
    if (rem === 2) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
    else if (rem === 3) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4), ((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));

    console.log(`  Query: ${query.substring(0, 40)}... (${queryBytes.length} bytes)`);

    // session_data = bytes[7..54] (48 bytes)
    // request_data = bytes[56..87] (32 bytes)
    if (queryBytes.length >= 88) {
      const sessionData = queryBytes.slice(7, 55);
      const requestData = queryBytes.slice(56, 88);

      // 用 Node.js crypto 尝试每个 16 字节数组作为 AES key
      const crypto = require('crypto');
      console.log(`\n  Trying ${unique16.length} unique 16-byte arrays as AES keys...`);

      for (const a of unique16) {
        try {
          // flag=0: IV = zeros
          const dec = crypto.createDecipheriv('aes-128-cbc', Buffer.from(a.data), Buffer.alloc(16));
          dec.setAutoPadding(false);
          const result = Buffer.concat([dec.update(Buffer.from(sessionData)), dec.final()]);

          // 检查 ASCII 比率
          const asciiCount = [...result].filter(b => b >= 32 && b <= 126).length;
          const ratio = asciiCount / result.length;

          if (ratio > 0.6) {
            console.log(`  *** HIT! [${a.id}] src=${a.source} ascii=${(ratio*100).toFixed(0)}% ***`);
            console.log(`    key=[${a.data.join(',')}]`);
            console.log(`    decrypted=[${[...result].join(',')}]`);
            console.log(`    text=${result.toString('utf8').substring(0, 50)}`);
          }
        } catch (e) {}

        // 也尝试 request_data
        try {
          const dec = crypto.createDecipheriv('aes-128-cbc', Buffer.from(a.data), Buffer.alloc(16));
          dec.setAutoPadding(false);
          const result = Buffer.concat([dec.update(Buffer.from(requestData)), dec.final()]);
          const asciiCount = [...result].filter(b => b >= 32 && b <= 126).length;
          const ratio = asciiCount / result.length;
          if (ratio > 0.6) {
            console.log(`  *** HIT (request)! [${a.id}] src=${a.source} ascii=${(ratio*100).toFixed(0)}% ***`);
            console.log(`    key=[${a.data.join(',')}]`);
            console.log(`    decrypted=[${[...result].join(',')}]`);
          }
        } catch (e) {}
      }

      // 也尝试 32 字节数组作为 AES-256 key
      console.log(`\n  Trying ${unique32.length} unique 32-byte arrays as AES-256 keys...`);
      for (const a of unique32) {
        try {
          const dec = crypto.createDecipheriv('aes-256-cbc', Buffer.from(a.data), Buffer.alloc(16));
          dec.setAutoPadding(false);
          const result = Buffer.concat([dec.update(Buffer.from(sessionData)), dec.final()]);
          const asciiCount = [...result].filter(b => b >= 32 && b <= 126).length;
          const ratio = asciiCount / result.length;
          if (ratio > 0.6) {
            console.log(`  *** HIT-256! [${a.id}] src=${a.source} ascii=${(ratio*100).toFixed(0)}% ***`);
            console.log(`    key=[${a.data.join(',')}]`);
            console.log(`    decrypted=[${[...result].join(',')}]`);
          }
        } catch (e) {}
      }
    }
  }

  // 保存结果
  const result = {
    timestamp: new Date().toISOString(),
    capturedQueries: capturedQueries.map(q => ({ method: q.method, path: q.path, query: q.query })),
    trappedArrays: trapData.arrays.slice(0, 200), // 限制大小
    trappedStrings: trapData.strings.slice(0, 100),
    uniqueArrays16: unique16.map(a => a.data),
    uniqueArrays32: unique32.map(a => a.data),
    uniqueArrays48: unique48.map(a => a.data),
  };

  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-array-trap.json'),
    JSON.stringify(result, null, 2)
  );
  console.log('\n结果已保存到 output/capture-20080/query-array-trap.json');

  await browser.close();
  process.exit(0);
})().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
