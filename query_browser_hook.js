/**
 * query_browser_hook.js — 在浏览器中 hook 加密函数，捕获 query 密钥
 *
 * 策略：
 * 1. 用 CDP Runtime.evaluate 在页面主 context 中安装 hook
 * 2. Hook Array.prototype.push（捕获 16/32/48/88 字节数组构建）
 * 3. Hook String.fromCharCode（捕获编码字符串构建）
 * 4. Hook Uint8Array 构造器
 * 5. Reload 触发 query 生成
 * 6. 读取捕获的数据
 * 7. 用捕获的 key 尝试解密 query
 *
 * 关键：用 CDP Runtime.evaluate（不是 page.evaluate）
 * 因为 Patchright 有 context 隔离
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = __dirname, TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';

(async () => {
  const { chromium } = require('patchright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    proxy: { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' },
  });

  let nsd = null, cd = null;
  const queries = [];
  context.on('request', req => {
    const url = req.url();
    if (url.includes('r20SZOQm=')) {
      const m = url.match(/r20SZOQm=([^&]+)/);
      if (m) queries.push({ method: req.method(), path: new URL(url).pathname, query: m[1] });
    }
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Runtime.enable');

  page.on('response', async resp => {
    if (resp.status() === 412 && !nsd) {
      const body = await resp.text().catch(() => '');
      const m = body.match(/\$_ts\.nsd=(\d+);\$_ts\.cd="([^"]+)"/);
      if (m) { nsd = +m[1]; cd = m[2]; }
    }
  });

  console.log('Loading...');
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log(`nsd=${nsd}`);

  // 在 reload 前安装 hook（通过 CDP Runtime.evaluate）
  console.log('Installing hooks via CDP...');
  await client.send('Runtime.evaluate', {
    expression: `(function(){
      // 清空之前的捕获
      window.__cap = { arrays: [], strings: [], joins: [] };

      // Hook Array.prototype.push — 捕获大数组构建
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        // 检查 this 是否在构建字节数组
        if (this.length >= 15 && this.length <= 90) {
          var allBytes = true;
          for (var i = 0; i < Math.min(this.length, 5); i++) {
            if (typeof this[i] !== 'number' || this[i] < 0 || this[i] > 255) { allBytes = false; break; }
          }
          if (allBytes && arguments.length > 0) {
            // 检查 push 的参数是否也是字节
            var argBytes = true;
            for (var j = 0; j < Math.min(arguments.length, 3); j++) {
              if (typeof arguments[j] !== 'number' || arguments[j] < 0 || arguments[j] > 255) { argBytes = false; break; }
            }
            if (argBytes) {
              // 捕获关键长度的数组
              var newLen = this.length + arguments.length;
              if (newLen === 16 || newLen === 32 || newLen === 48 || newLen === 88) {
                window.__cap.arrays.push({
                  len: newLen,
                  before: Array.prototype.slice.call(this, 0, Math.min(this.length, 20)),
                  args: Array.prototype.slice.call(arguments, 0, 5),
                  time: Date.now()
                });
              }
            }
          }
        }
        return origPush.apply(this, arguments);
      };

      // Hook Array.prototype.join — 捕获编码结果
      var origJoin = Array.prototype.join;
      Array.prototype.join = function(sep) {
        var result = origJoin.apply(this, arguments);
        if (typeof result === 'string' && result.length > 40 && result[0] === '0') {
          // 检查 this 是否是字节数组
          var allBytes = true;
          for (var i = 0; i < Math.min(this.length, 5); i++) {
            if (typeof this[i] !== 'number' || this[i] < 0 || this[i] > 255) { allBytes = false; break; }
          }
          if (allBytes) {
            window.__cap.joins.push({
              arrLen: this.length,
              result: result.substring(0, 150),
              arrHead: Array.prototype.slice.call(this, 0, 20),
              time: Date.now()
            });
          }
        }
        return result;
      };

      // Hook String.fromCharCode — 批量调用
      var origFCC = String.fromCharCode;
      var fccCount = 0;
      String.fromCharCode = function() {
        var result = origFCC.apply(null, arguments);
        if (arguments.length > 20) {
          window.__cap.strings.push({
            len: arguments.length,
            result: result.substring(0, 100),
            time: Date.now()
          });
        }
        return result;
      };

      return 'hooks installed';
    })()`,
    returnByValue: true,
  });

  console.log('Reload...');
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);

  console.log(`Queries: ${queries.length}`);
  queries.slice(0, 3).forEach((q, i) => console.log(`  [${i}] ${q.method} ${q.path} q=${q.query.substring(0, 40)}...`));

  // 读取捕获的数据
  const capResult = await client.send('Runtime.evaluate', {
    expression: 'JSON.stringify({arrays: window.__cap?.arrays || [], joins: window.__cap?.joins || [], strings: (window.__cap?.strings || []).slice(-20)})',
    returnByValue: true,
  });

  let cap;
  try { cap = JSON.parse(capResult.result.value); } catch(e) { cap = { arrays: [], joins: [], strings: [] }; }

  console.log(`\n=== Captures ===`);
  console.log(`Arrays: ${cap.arrays.length}`);
  console.log(`Joins: ${cap.joins.length}`);
  console.log(`Strings: ${cap.strings.length}`);

  // 显示 join 捕获（编码结果）
  console.log('\n=== Join results ===');
  cap.joins.slice(0, 10).forEach((j, i) => {
    console.log(`  [${i}] arrLen=${j.arrLen} result="${j.result.substring(0, 60)}"`);
    console.log(`       arrHead=[${j.arrHead.join(',')}]`);
  });

  // 显示数组捕获
  console.log('\n=== Array captures ===');
  // 按长度分组
  const byLen = {};
  cap.arrays.forEach(a => { byLen[a.len] = (byLen[a.len] || 0) + 1; });
  console.log('By length:', JSON.stringify(byLen));

  // 显示 16 字节数组（可能是 key）
  const arr16 = cap.arrays.filter(a => a.len === 16);
  console.log(`\n16-byte arrays: ${arr16.length}`);
  // 去重
  const seen16 = {};
  arr16.forEach(a => {
    const key = a.before.slice(0, 15).join(',') + '|' + a.args.join(',');
    if (!seen16[key]) {
      seen16[key] = true;
      console.log(`  before=[${a.before.slice(0, 8).join(',')}...] args=[${a.args.join(',')}]`);
    }
  });

  // 匹配 query
  if (queries.length > 0 && cap.joins.length > 0) {
    console.log('\n=== Match query ===');
    const qVal = queries[0].query;
    cap.joins.forEach((j, i) => {
      if (j.result.startsWith(qVal.substring(0, 15))) {
        console.log(`*** Join[${i}] matches query! ***`);
        console.log(`  arrLen: ${j.arrLen}`);
        console.log(`  arrHead: [${j.arrHead.join(',')}]`);
        console.log(`  result: ${j.result.substring(0, 80)}`);
      }
    });
  }

  // 如果有 join 结果匹配 query，用 arrHead 作为明文推导 key
  if (queries.length > 0) {
    // 解码 query
    const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
    const idxmap = {};
    basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
    const payload = queries[0].query.startsWith('0') ? queries[0].query.slice(1) : queries[0].query;
    const queryBytes = [];
    let i = 0;
    const full = Math.floor(payload.length / 4);
    for (let g = 0; g < full; g++) {
      const c0=idxmap[payload[i]],c1=idxmap[payload[i+1]],c2=idxmap[payload[i+2]],c3=idxmap[payload[i+3]];
      i+=4; queryBytes.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);
    }
    const rem = payload.length-i;
    if (rem===2) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4));
    else if (rem===3) queryBytes.push((idxmap[payload[i]]<<2)|(idxmap[payload[i+1]]>>4),((idxmap[payload[i+1]]&15)<<4)|(idxmap[payload[i+2]]>>2));

    console.log(`\n=== Query decoded: ${queryBytes.length} bytes ===`);
    console.log(`Bytes: [${queryBytes.join(',')}]`);

    // 检查 join 的 arrHead 是否匹配 query 的前几个字节
    cap.joins.forEach((j, jIdx) => {
      // join 的 result 以 '0' 开头 → query 也以 '0' 开头
      // join 的 arrHead 是编码前的字节数组
      // 如果 join result 匹配 query → arrHead 就是 query 的明文（编码前）
      if (j.result[0] === '0' && j.arrLen >= 80) {
        console.log(`\nJoin[${jIdx}] arrLen=${j.arrLen}: potential query pre-encoding`);
        console.log(`  arrHead: [${j.arrHead.join(',')}]`);
        // 检查 arrHead 是否与 queryBytes 前 20 字节匹配
        // 如果是 numarr2string 编码，arrHead 就是编码前的字节
        let match = true;
        for (let k = 0; k < Math.min(j.arrHead.length, queryBytes.length); k++) {
          if (j.arrHead[k] !== queryBytes[k]) { match = false; break; }
        }
        console.log(`  Matches query bytes: ${match}`);
      }
    });
  }

  // 保存
  fs.writeFileSync(
    path.join(ROOT, 'output/capture-20080/query-browser-hook.json'),
    JSON.stringify({
      nsd, cd,
      queries: queries.map(q => ({ method: q.method, path: q.path, query: q.query })),
      arrays: cap.arrays.slice(0, 100),
      joins: cap.joins.slice(0, 50),
      strings: cap.strings.slice(0, 20),
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('\nSaved');

  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
