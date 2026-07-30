// 数组陷阱：在浏览器中截获 RS query 参数加密的中间值（明文、密钥、密文）
// 用法: NODE_OPTIONS=--dns-result-order=ipv4first NODE_PATH=/Users/luoyy/work/github/GitHub/rs-reverse_kimi/node_modules node array_trap_query.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.OPENSSL_LEGACY_RENEGOTIATION = '1';

const fs = require('fs');
const path = require('path');
const { chromium } = require('patchright');

const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ============================================================
// 注入到浏览器的数组陷阱 hook
// ============================================================
const TRAP_SCRIPT = `
(function() {
  // 存储捕获的数组，按长度分类
  window.__traps = {
    all: [],           // 所有捕获的数组（带时间戳和调用栈）
    byLen: {},         // 按长度分类
    queryRelated: [],  // query 生成期间捕获的数组（带上下文）
  };

  // query 生成的时间窗口标记
  window.__queryGenStart = false;
  window.__queryGenEnd = false;
  window.__queryGenTimestamp = null;

  // 判断是否为全字节数组（0-255）
  function isByteArray(a) {
    if (!Array.isArray(a) && !(a && typeof a.length === 'number' && a.buffer === undefined && typeof a !== 'string')) return false;
    if (a.length === 0) return false;
    for (let i = 0; i < a.length; i++) {
      if (typeof a[i] !== 'number' || a[i] < 0 || a[i] > 255 || !Number.isInteger(a[i])) return false;
    }
    return true;
  }

  // 判断是否为感兴趣的长度
  function isInterestingLen(len) {
    return [4, 8, 16, 17, 32, 48, 80, 84, 88].includes(len) || (len >= 4 && len <= 128 && len % 4 === 0);
  }

  // 记录捕获的数组
  function record(arr, source) {
    try {
      if (!isByteArray(arr)) return;
      const len = arr.length;
      if (!isInterestingLen(len)) return;

      const snapshot = Array.from(arr);
      const entry = {
        arr: snapshot,
        len: len,
        source: source,
        ts: Date.now(),
        queryPhase: window.__queryGenStart ? 'during' : (window.__queryGenEnd ? 'after' : 'before'),
        // 截取调用栈的前 5 帧
        stack: new Error().stack.split('\\n').slice(1, 6).map(s => s.trim()),
      };

      window.__traps.all.push(entry);
      if (window.__traps.all.length > 5000) window.__traps.all.shift();

      if (!window.__traps.byLen[len]) window.__traps.byLen[len] = [];
      window.__traps.byLen[len].push({ arr: snapshot, source, ts: entry.ts, stack: entry.stack });

      // 如果在 query 生成期间，特别记录
      if (window.__queryGenStart) {
        window.__traps.queryRelated.push(entry);
        if (window.__traps.queryRelated.length > 2000) window.__traps.queryRelated.shift();
      }
    } catch(e) {}
  }

  // ============================================================
  // Hook 1: Array.prototype 方法
  // ============================================================
  const AP = Array.prototype;
  const methods = ['slice', 'concat', 'map', 'filter', 'flat', 'flatMap', 'splice', 'reverse', 'fill'];
  for (const m of methods) {
    const orig = AP[m];
    if (!orig) continue;
    AP[m] = function() {
      const result = orig.apply(this, arguments);
      record(result, 'Array.prototype.' + m);
      // 也检查 this（可能本身是字节数组）
      if (m === 'slice' || m === 'splice') record(this, 'Array.prototype.' + m + '.this');
      return result;
    };
  }

  // Hook Array.from
  const origFrom = Array.from;
  Array.from = function() {
    const result = origFrom.apply(this, arguments);
    record(result, 'Array.from');
    return result;
  };

  // Hook new Array 构造（通过 Proxy）
  // 不能直接 hook，但可以 hook push/pop 等方法来捕获构建中的数组

  // ============================================================
  // Hook 2: TypedArray 方法（Uint8Array 等）
  // ============================================================
  try {
    const U8P = Uint8Array.prototype;
    for (const m of ['slice', 'subarray']) {
      const orig = U8P[m];
      if (!orig) continue;
      U8P[m] = function() {
        const result = orig.apply(this, arguments);
        record(result, 'Uint8Array.' + m);
        return result;
      };
    }
  } catch(e) {}

  // ============================================================
  // Hook 3: String.prototype.split（RS 可能用 split 处理 URL/cookie）
  // ============================================================
  const origSplit = String.prototype.split;
  String.prototype.split = function(sep) {
    const result = origSplit.call(this, sep);
    // 只记录 split 出的字节数组（不太可能，但记录 URL split）
    if (typeof sep === 'string' && (sep === ';' || sep === ',' || sep === '&' || sep === '?')) {
      try {
        if (result.length > 1 && result.length < 50) {
          window.__traps.all.push({
            type: 'stringSplit',
            sep: sep,
            parts: result.map(s => String(s).substring(0, 100)),
            ts: Date.now(),
            queryPhase: window.__queryGenStart ? 'during' : 'other',
            stack: new Error().stack.split('\\n').slice(1, 4).map(s => s.trim()),
          });
        }
      } catch(e) {}
    }
    return result;
  };

  // ============================================================
  // Hook 4: encodeURIComponent（URL 编码 query 值）
  // ============================================================
  const origEncode = encodeURIComponent;
  encodeURIComponent = function(str) {
    const result = origEncode(str);
    // 如果编码的字符串看起来像 query 值（以 0 开头，长度 > 50）
    if (typeof str === 'string' && str.length > 50 && str.startsWith('0')) {
      window.__traps.queryRelated.push({
        type: 'encodeURIComponent',
        input: str.substring(0, 200),
        output: result.substring(0, 200),
        ts: Date.now(),
        stack: new Error().stack.split('\\n').slice(1, 6).map(s => s.trim()),
      });
    }
    return result;
  };

  // ============================================================
  // Hook 5: Array.prototype.join（拼接 query 字符串）
  // ============================================================
  const origJoin = AP.join;
  AP.join = function(sep) {
    const result = origJoin.call(this, sep);
    // 如果 join 结果看起来像 query 值
    if (typeof result === 'string' && result.length > 50 && result.length < 200) {
      // 检查是否为 base64-like 字符
      const charCode0 = result.charCodeAt(0);
      if (charCode0 >= 48 && charCode0 <= 57) { // 数字开头
        window.__traps.queryRelated.push({
          type: 'join',
          sep: sep,
          result: result.substring(0, 200),
          arrLen: this.length,
          ts: Date.now(),
          stack: new Error().stack.split('\\n').slice(1, 6).map(s => s.trim()),
        });
      }
    }
    return result;
  };

  // ============================================================
  // Hook 6: String.fromCharCode（RS 构造字符串）
  // ============================================================
  const origFromCharCode = String.fromCharCode;
  String.fromCharCode = function() {
    const result = origFromCharCode.apply(String, arguments);
    // 如果参数是字节数组范围（0-255）且数量 > 4
    if (arguments.length > 4 && arguments.length < 200) {
      const args = Array.from(arguments);
      if (args.every(a => typeof a === 'number' && a >= 0 && a <= 255)) {
        record(args, 'String.fromCharCode.args');
      }
    }
    return result;
  };

  // ============================================================
  // Hook 7: XMLHttpRequest（标记 query 生成时间窗口）
  // ============================================================
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  OrigXHR.prototype.open = function(method, url) {
    this.__rsMethod = method;
    this.__rsUrl = String(url);
    this.__rsOrigUrl = String(url);
    return origOpen.apply(this, arguments);
  };

  OrigXHR.prototype.send = function(body) {
    // 检查 URL 是否被 RS 修改（追加了 query）
    const finalUrl = this.__rsUrl || '';
    const hasQuery = finalUrl.includes('r20SZOQm=') || (typeof this.__rsOrigUrl === 'string' && this.__rsOrigUrl !== finalUrl);

    if (hasQuery || this.__rsMethod === 'POST') {
      // 标记 query 生成开始
      window.__queryGenStart = true;
      window.__queryGenTimestamp = Date.now();

      // 记录 URL 变化
      window.__traps.queryRelated.push({
        type: 'xhrSend',
        method: this.__rsMethod,
        origUrl: this.__rsOrigUrl,
        finalUrl: finalUrl,
        hasQuery: finalUrl.includes('r20SZOQm='),
        ts: Date.now(),
        stack: new Error().stack.split('\\n').slice(1, 8).map(s => s.trim()),
      });
    }

    const ret = origSend.apply(this, arguments);

    // query 生成结束（给一点时间让异步操作完成）
    setTimeout(() => {
      window.__queryGenStart = false;
      window.__queryGenEnd = true;
    }, 50);

    return ret;
  };

  // Hook URL setter / open 的 URL 参数
  // RS 可能通过修改 open 的第二个参数来追加 query
  // 上面的 open hook 已经记录了原始 URL，但 RS 可能在 open 之后、send 之前修改
  // 所以我们也 hook open 的 url 参数本身
  // 实际上 RS 的做法是：hook open，存储原始 url，在 send 时构造新 url 并重新 open
  // 所以我们需要监听 open 被多次调用的情况
  let openCallCount = new WeakMap();
  const origOpen2 = OrigXHR.prototype.open;
  OrigXHR.prototype.open = function(method, url) {
    let count = (openCallCount.get(this) || 0) + 1;
    openCallCount.set(this, count);
    if (count > 1 || (this.__rsOrigUrl && String(url) !== this.__rsOrigUrl)) {
      window.__traps.queryRelated.push({
        type: 'xhrReopen',
        method: method,
        url: String(url),
        prevUrl: this.__rsOrigUrl,
        callCount: count,
        ts: Date.now(),
        stack: new Error().stack.split('\\n').slice(1, 8).map(s => s.trim()),
      });
    }
    this.__rsUrl = String(url);
    if (count === 1) this.__rsOrigUrl = String(url);
    return origOpen2.apply(this, arguments);
  };

  // ============================================================
  // Hook 8: 监控 location.href / URL 变化（SPA 路由可能触发请求）
  // ============================================================

  console.log('[TRAP] Array traps installed');
})();
`;

// ============================================================
// 主函数
// ============================================================
async function main() {
  console.log('Starting browser with array traps for query parameter analysis...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--ignore-certificate-errors'],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: UA,
  });

  // 注入数组陷阱（在 RS 代码加载前）
  await context.addInitScript(TRAP_SCRIPT);

  const page = await context.newPage();

  // 捕获所有请求，记录带 query 的请求
  const queryRequests = [];
  const allRequests = [];

  context.on('request', req => {
    const url = req.url();
    allRequests.push({ method: req.method(), url, ts: Date.now() });
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      queryRequests.push({
        method: req.method(),
        url: url,
        path: new URL(url).pathname,
        query: m ? m[1] : null,
        body: req.postData() || '',
        ts: Date.now(),
      });
      console.log(`  [QUERY] ${req.method()} ${new URL(url).pathname} query=${m ? m[1].substring(0, 30) + '...' : '???'}`);
    }
  });

  // 捕获 412 响应（获取 nsd/cd）
  let ts = null;
  page.on('response', async resp => {
    try {
      if (resp.status() === 412 && !ts) {
        const text = await resp.text().catch(() => '');
        const m = text.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
        if (m) {
          ts = { nsd: +m[1], cd: m[2] };
          console.log(`  [412] nsd=${ts.nsd} cd=${ts.cd.substring(0, 30)}...`);
        }
      }
    } catch(e) {}
  });

  // Step 1: 首次加载（触发 412 → RS 生成 cookie）
  console.log('\n=== Step 1: Initial page load (412 challenge) ===');
  await page.goto(TARGET, { waitUntil: 'load', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // 检查 cookie 是否已生成
  const cookies1 = await context.cookies();
  const pCookie = cookies1.find(c => c.name.endsWith('P'));
  const oCookie = cookies1.find(c => c.name.endsWith('O'));
  console.log(`  Cookies: P=${pCookie ? pCookie.value.length + 'chars' : 'none'}, O=${oCookie ? 'yes' : 'none'}`);

  // 清空之前的捕获
  console.log('\n=== Step 2: Reload to trigger query generation ===');
  await page.evaluate(() => {
    window.__traps = {
      all: [],
      byLen: {},
      queryRelated: [],
    };
    window.__queryGenStart = false;
    window.__queryGenEnd = false;
  });
  queryRequests.length = 0;

  // Step 2: Reload（此时 cookie 已存在，RS 会启用 query 生成）
  await page.reload({ waitUntil: 'load', timeout: 45000 }).catch(() => {});

  // 等待 SPA API 请求完成
  console.log('  Waiting for SPA API requests...');
  await page.waitForTimeout(15000);

  // Step 3: 收集所有捕获的数据
  console.log('\n=== Step 3: Analyzing captured data ===');

  const traps = await page.evaluate(() => {
    // 去重并统计
    function dedupe(entries) {
      const seen = new Map();
      for (const e of entries) {
        if (!e.arr) continue;
        const key = e.arr.join(',');
        if (seen.has(key)) {
          seen.get(key).count++;
        } else {
          seen.set(key, { ...e, count: 1 });
        }
      }
      return [...seen.values()];
    }

    return {
      byLen: window.__traps.byLen,
      queryRelated: window.__traps.queryRelated,
      allCount: window.__traps.all.length,
      uniqueByLen: Object.fromEntries(
        Object.entries(window.__traps.byLen).map(([len, entries]) => {
          const deduped = dedupe(entries);
          return [len, deduped.sort((a, b) => b.count - a.count)];
        })
      ),
    };
  }).catch(e => {
    console.error('Failed to evaluate traps:', e.message);
    return null;
  });

  if (!traps) {
    console.log('No trap data collected');
    await browser.close();
    process.exit(1);
  }

  console.log(`\nTotal captures: ${traps.allCount}`);
  console.log(`Query-related captures: ${traps.queryRelated.length}`);
  console.log(`Query requests observed: ${queryRequests.length}`);

  // 分析按长度分类的数组
  console.log('\n=== Arrays by length ===');
  const interestingLens = [4, 8, 16, 17, 32, 48, 80, 84, 88];
  for (const len of Object.keys(traps.uniqueByLen).sort((a, b) => +a - +b)) {
    const entries = traps.uniqueByLen[len];
    console.log(`  Len ${len}: ${entries.length} unique arrays (top count: ${entries[0]?.count || 0})`);
    // 显示前 3 个
    entries.slice(0, 3).forEach((e, i) => {
      console.log(`    #${i + 1} (count=${e.count}, src=${e.source}): [${e.arr.slice(0, 20).join(',')}${e.arr.length > 20 ? '...' : ''}]`);
    });
  }

  // 分析 query 相关的捕获
  console.log('\n=== Query-related captures ===');
  const queryArrCaptures = traps.queryRelated.filter(e => e.arr);
  const queryOtherCaptures = traps.queryRelated.filter(e => !e.arr);

  console.log(`  Array captures during query gen: ${queryArrCaptures.length}`);
  console.log(`  Other captures (join/split/xhr): ${queryOtherCaptures.length}`);

  // 按长度分组 query 相关的数组
  const queryByLen = {};
  for (const e of queryArrCaptures) {
    if (!queryByLen[e.len]) queryByLen[e.len] = [];
    queryByLen[e.len].push(e);
  }

  console.log('\n  Query-related arrays by length:');
  for (const len of Object.keys(queryByLen).sort((a, b) => +a - +b)) {
    const entries = queryByLen[len];
    // 去重
    const seen = new Map();
    for (const e of entries) {
      const key = e.arr.join(',');
      if (seen.has(key)) seen.get(key).count++;
      else seen.set(key, { ...e, count: 1 });
    }
    const deduped = [...seen.values()].sort((a, b) => b.count - a.count);
    console.log(`    Len ${len}: ${deduped.length} unique`);
    deduped.slice(0, 5).forEach((e, i) => {
      console.log(`      #${i + 1} (count=${e.count}, src=${e.source}): [${e.arr.slice(0, 24).join(',')}${e.arr.length > 24 ? '...' : ''}]`);
    });
  }

  // 显示非数组的 query 相关捕获（join/split/xhr）
  console.log('\n  Non-array query-related captures:');
  queryOtherCaptures.slice(0, 20).forEach((e, i) => {
    if (e.type === 'join') {
      console.log(`    #${i} JOIN (sep="${e.sep}", arrLen=${e.arrLen}): "${e.result?.substring(0, 80)}..."`);
    } else if (e.type === 'xhrSend') {
      console.log(`    #${i} XHR SEND ${e.method} hasQuery=${e.hasQuery}`);
      console.log(`       origUrl: ${e.origUrl?.substring(0, 80)}`);
      console.log(`       finalUrl: ${e.finalUrl?.substring(0, 80)}`);
    } else if (e.type === 'xhrReopen') {
      console.log(`    #${i} XHR REOPEN ${e.method} callCount=${e.callCount}`);
      console.log(`       prevUrl: ${e.prevUrl?.substring(0, 80)}`);
      console.log(`       url: ${e.url?.substring(0, 80)}`);
    } else if (e.type === 'encodeURIComponent') {
      console.log(`    #${i} ENCODE input="${e.input?.substring(0, 50)}..."`);
    } else if (e.type === 'stringSplit') {
      console.log(`    #${i} SPLIT sep="${e.sep}" parts=${e.parts?.length}`);
    }
  });

  // 特别关注：尝试找到 16 字节密钥候选
  console.log('\n=== 16-byte array candidates (potential keys) ===');
  const len16 = traps.uniqueByLen['16'] || [];
  // 过滤：排除全 0 或已知 keys16/keys17
  const knownKeys16 = ts ? null : null; // 我们没有 pipeline keys 在这里
  len16.slice(0, 20).forEach((e, i) => {
    const isAllSame = e.arr.every(v => v === e.arr[0]);
    const hasHighBytes = e.arr.some(v => v > 127);
    console.log(`  #${i + 1} (count=${e.count}, src=${e.source}, highBytes=${hasHighBytes}): [${e.arr.join(',')}]`);
  });

  // 特别关注：32 字节候选
  console.log('\n=== 32-byte array candidates ===');
  const len32 = traps.uniqueByLen['32'] || [];
  len32.slice(0, 10).forEach((e, i) => {
    console.log(`  #${i + 1} (count=${e.count}, src=${e.source}): [${e.arr.slice(0, 16).join(',')}, ${e.arr.slice(16).join(',')}]`);
  });

  // 48 字节候选
  console.log('\n=== 48-byte array candidates ===');
  const len48 = traps.uniqueByLen['48'] || [];
  len48.slice(0, 10).forEach((e, i) => {
    console.log(`  #${i + 1} (count=${e.count}, src=${e.source}): [${e.arr.slice(0, 16).join(',')}, ${e.arr.slice(16, 32).join(',')}, ${e.arr.slice(32).join(',')}]`);
  });

  // 88 字节候选（完整 query 明文）
  console.log('\n=== 88-byte array candidates (potential full query plaintext) ===');
  const len88 = traps.uniqueByLen['88'] || [];
  len88.slice(0, 10).forEach((e, i) => {
    console.log(`  #${i + 1} (count=${e.count}, src=${e.source}):`);
    console.log(`    [${e.arr.slice(0, 22).join(',')}]`);
    console.log(`    [${e.arr.slice(22, 44).join(',')}]`);
    console.log(`    [${e.arr.slice(44, 66).join(',')}]`);
    console.log(`    [${e.arr.slice(66).join(',')}]`);
  });

  // 80/84 字节候选
  for (const len of ['80', '84']) {
    const entries = traps.uniqueByLen[len] || [];
    if (entries.length > 0) {
      console.log(`\n=== ${len}-byte array candidates ===`);
      entries.slice(0, 5).forEach((e, i) => {
        console.log(`  #${i + 1} (count=${e.count}, src=${e.source}): [${e.arr.slice(0, 20).join(',')}${e.arr.length > 20 ? '...' : ''}]`);
      });
    }
  }

  // 保存完整数据到文件
  const outputPath = path.join(ROOT, 'output/capture-20080/array-trap-query.json');

  // 准备序列化数据（限制大小）
  const serializable = {
    timestamp: new Date().toISOString(),
    ts: ts,
    queryRequests: queryRequests.map(q => ({
      method: q.method,
      path: q.path,
      query: q.query,
      body: q.body ? q.body.substring(0, 200) : '',
    })),
    trapsSummary: {
      allCount: traps.allCount,
      queryRelatedCount: traps.queryRelated.length,
      byLenCounts: Object.fromEntries(
        Object.entries(traps.uniqueByLen).map(([len, entries]) => [len, entries.length])
      ),
    },
    // 保存所有唯一数组（按长度）
    uniqueArrays: {},
  };

  for (const [len, entries] of Object.entries(traps.uniqueByLen)) {
    serializable.uniqueArrays[len] = entries.slice(0, 50).map(e => ({
      arr: e.arr,
      count: e.count,
      source: e.source,
      stack: e.stack,
    }));
  }

  // 保存 query 相关的非数组捕获
  serializable.queryRelatedOther = queryOtherCaptures.slice(0, 100);

  // 保存 query 相关的数组捕获
  serializable.queryRelatedArrays = queryArrCaptures.slice(0, 200).map(e => ({
    arr: e.arr,
    len: e.len,
    source: e.source,
    stack: e.stack,
  }));

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(serializable, null, 2));
  console.log(`\n=== Full data saved to ${outputPath} ===`);

  // 如果有 query 样本和 16 字节数组，尝试解密
  if (queryRequests.length > 0 && queryRequests[0].query && len16.length > 0) {
    console.log('\n=== Decryption attempts with captured 16-byte keys ===');
    attemptDecrypt(queryRequests[0].query, len16, traps.uniqueByLen);
  }

  await browser.close();
  process.exit(0);
}

// ============================================================
// 解密尝试：用捕获的 16 字节数组作为密钥
// ============================================================
function attemptDecrypt(queryStr, len16Entries, allByLen) {
  // 解码 query（使用 basestr）
  const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
  const idxmap = {};
  basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

  function decode(str) {
    const n = []; let i = 0;
    const f = Math.floor(str.length / 4);
    for (let g = 0; g < f; g++) {
      const a = idxmap[str[i]], b = idxmap[str[i + 1]], c = idxmap[str[i + 2]], d = idxmap[str[i + 3]];
      i += 4; n.push((a << 2) | (b >> 4), ((b & 15) << 4) | (c >> 2), ((c & 3) << 6) | d);
    }
    const r = str.length - i;
    if (r === 2) n.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4));
    else if (r === 3) n.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4), ((idxmap[str[i + 1]] & 15) << 4) | (idxmap[str[i + 2]] >> 2));
    return n;
  }

  const raw = queryStr.startsWith('0') ? queryStr.slice(1) : queryStr;
  const queryBytes = decode(raw);
  console.log(`  Query decoded: ${queryBytes.length} bytes`);
  console.log(`  Head: [${queryBytes.slice(0, 10).join(',')}]`);

  // 拆分 query 结构
  const nonce = queryBytes.slice(0, 4);
  const sessionData = queryBytes.slice(7, 55);  // 48 bytes
  const requestData = queryBytes.slice(56);      // 32 bytes

  console.log(`  Nonce: [${nonce.join(',')}]`);
  console.log(`  Session (48B): [${sessionData.slice(0, 16).join(',')}...]`);
  console.log(`  Request (32B): [${requestData.slice(0, 16).join(',')}...]`);

  // 尝试每个 16 字节数组作为 AES-CBC 密钥
  const crypto = require('crypto');
  console.log(`\n  Trying ${len16Entries.length} 16-byte keys...`);

  for (const entry of len16Entries.slice(0, 30)) {
    const key = Buffer.from(entry.arr);
    for (const dataLabel of ['session', 'request']) {
      const data = dataLabel === 'session' ? sessionData : requestData;
      const dataBuf = Buffer.from(data);
      try {
        // AES-CBC with zero IV
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0));
        decipher.setAutoPadding(false);
        const dec = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
        const ascii = [...dec].filter(b => b >= 32 && b <= 126).length;
        const ratio = ascii / dec.length;
        if (ratio > 0.5) {
          console.log(`  HIT! ${dataLabel} key(count=${entry.count},src=${entry.source}): ${dec.length}B ascii=${(ratio * 100).toFixed(0)}%`);
          console.log(`    text: ${dec.toString('utf8').substring(0, 60)}`);
          console.log(`    key: [${entry.arr.join(',')}]`);
        }
      } catch(e) {}
    }
  }

  // 也尝试 32 字节密钥
  const len32 = allByLen['32'] || [];
  if (len32.length > 0) {
    console.log(`\n  Trying ${Math.min(len32.length, 20)} 32-byte keys (AES-256)...`);
    for (const entry of len32.slice(0, 20)) {
      const key = Buffer.from(entry.arr);
      for (const dataLabel of ['session', 'request']) {
        const data = dataLabel === 'session' ? sessionData : requestData;
        const dataBuf = Buffer.from(data);
        try {
          const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.alloc(16, 0));
          decipher.setAutoPadding(false);
          const dec = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
          const ascii = [...dec].filter(b => b >= 32 && b <= 126).length;
          const ratio = ascii / dec.length;
          if (ratio > 0.5) {
            console.log(`  HIT! ${dataLabel} key32(count=${entry.count},src=${entry.source}): ${dec.length}B ascii=${(ratio * 100).toFixed(0)}%`);
            console.log(`    text: ${dec.toString('utf8').substring(0, 60)}`);
          }
        } catch(e) {}
      }
    }
  }

  // 尝试 nonce 作为 IV 的一部分
  console.log(`\n  Trying nonce-based IV...`);
  const nonceIV = Buffer.alloc(16, 0);
  Buffer.from(nonce).copy(nonceIV);

  for (const entry of len16Entries.slice(0, 15)) {
    const key = Buffer.from(entry.arr);
    for (const dataLabel of ['session', 'request']) {
      const data = dataLabel === 'session' ? sessionData : requestData;
      const dataBuf = Buffer.from(data);
      try {
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, nonceIV);
        decipher.setAutoPadding(false);
        const dec = Buffer.concat([decipher.update(dataBuf), decipher.final()]);
        const ascii = [...dec].filter(b => b >= 32 && b <= 126).length;
        const ratio = ascii / dec.length;
        if (ratio > 0.5) {
          console.log(`  HIT! ${dataLabel} nonceIV key(count=${entry.count}): ${dec.length}B ascii=${(ratio * 100).toFixed(0)}%`);
          console.log(`    text: ${dec.toString('utf8').substring(0, 60)}`);
        }
      } catch(e) {}
    }
  }
}

// ============================================================
// 运行
// ============================================================
main().catch(e => {
  console.error('FATAL:', e.message, e.stack);
  process.exit(1);
});
