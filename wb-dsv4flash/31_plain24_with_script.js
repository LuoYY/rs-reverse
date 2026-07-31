/**
 * 31_plain24_with_script.js
 *
 * 捕获 plain24 + 当前会话动态代码源码：
 *   1. Debugger.scriptParsed 记录所有脚本（含 eval 动态代码）
 *   2. hook slice/push 捕获 plain24 + 调用栈（含偏移）
 *   3. 用 Debugger.getScriptSource 获取动态代码源码
 *   4. 按调用栈偏移提取构造代码
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const { chromium } = require('patchright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUT = path.join(__dirname, 'captures');

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
async function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('超时: ' + label)), ms))]);
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  console.log('[1] 启动...');
  const browser = await withTimeout(chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] }), 60000, 'launch');
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  await cdp.send('Debugger.enable');

  // 记录所有脚本
  const scripts = [];
  cdp.on('Debugger.scriptParsed', (p) => {
    scripts.push({ scriptId: p.scriptId, url: p.url || '', len: p.length, ts: Date.now() });
  });

  console.log('[2] 加载 + reload...');
  await withTimeout(page.goto(TARGET, { timeout: 90000 }).catch(() => {}), 100000, 'goto');
  await delay(5000);
  await withTimeout(page.reload({ timeout: 90000 }).catch(() => {}), 100000, 'reload');
  await delay(12000);

  // 注入 hook（record 内用原始方法引用，避免递归）
  console.log('[3] 注入 hook...');
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      if (window.__ph) return 'already';
      var records = [];
      window.__ph = records;
      var count = 0;
      var O_PUSH = Array.prototype.push;
      var O_SLICE = Array.prototype.slice;
      function copyArr(arr, max) {
        var c = [];
        var n = Math.min(arr.length, max || 88);
        for (var i = 0; i < n; i++) O_PUSH.call(c, arr[i]);
        return c;
      }
      function record(tag, content, stack) {
        if (count < 60) {
          count++;
          O_PUSH.call(records, { tag: tag, len: content.length, content: copyArr(content, 88), stack: stack.substring(0, 2500) });
        }
      }
      var origSlice = Array.prototype.slice;
      Array.prototype.slice = function() {
        try {
          var r = origSlice.apply(this, arguments);
          if (r && r.length === 24) record('slice', r, (new Error()).stack);
          return r;
        } catch (e) { return origSlice.apply(this, arguments); }
      };
      var origPush = Array.prototype.push;
      Array.prototype.push = function() {
        try {
          var nl = this.length + arguments.length;
          if (nl === 24 && this.length <= 16) {
            var content = [];
            for (var i = 0; i < this.length; i++) O_PUSH.call(content, this[i]);
            for (var j = 0; j < arguments.length; j++) O_PUSH.call(content, arguments[j]);
            record('push', content, (new Error()).stack);
          }
        } catch (e) {}
        return origPush.apply(this, arguments);
      };
      return 'ok';
    })()`,
    returnByValue: true,
  });

  // 触发
  console.log('[4] 触发 POST...');
  try {
    await withTimeout(cdp.send('Runtime.evaluate', {
      expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
      returnByValue: true,
    }), 60000, 'trigger');
  } catch (e) { console.log('  触发超时:', e.message); }
  await delay(2000);

  // 导出记录
  const outR = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify(window.__ph || [])`, returnByValue: true });
  const records = JSON.parse(outR.result.value || '[]');
  console.log('[5] 记录数:', records.length);

  // 找动态代码脚本（eval 的，无 URL 的大脚本）
  const dynScripts = scripts.filter(s => !s.url && s.len > 100000);
  console.log('[6] eval 动态代码脚本数:', dynScripts.length, '长度:', dynScripts.map(s => s.len));

  // 获取所有大脚本源码
  const sources = [];
  for (const s of dynScripts) {
    try {
      const src = await cdp.send('Debugger.getScriptSource', { scriptId: s.scriptId });
      sources.push({ scriptId: s.scriptId, len: s.len, source: src.scriptSource });
      console.log('  获取脚本 ' + s.scriptId + ' len=' + src.scriptSource.length);
    } catch (e) {}
  }

  // 保存
  const fname = path.join(OUT, 'plain24_script_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify({ records, sources: sources.map(s => ({ len: s.len, source: s.source })) }, null, 2));
  console.log('  已保存:', fname);

  // 打印含 plain24 特征的记录 + 匹配偏移的函数源码
  console.log('\n=== plain24 记录 + 调用链源码 ===');
  const plain24Rec = records.filter(r => r.content[16] === 183 || (r.content[20] === 127 && r.content[21] === 51));
  if (plain24Rec.length) {
    const rec = plain24Rec[0];
    console.log('plain24: ' + rec.content.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('stack:');
    console.log(rec.stack);
    // 解析偏移并提取源码
    const frames = rec.stack.split('\n').slice(1).map(l => {
      const m = l.match(/at ([\w.$]+)(?: \[as ([\w.$]+)\])? \(eval at[^)]*\), <anonymous>:(\d+):(\d+)\)/);
      if (m) return { fn: m[1], as: m[2], line: +m[3], col: +m[4] };
      const m2 = l.match(/<anonymous>:(\d+):(\d+)/);
      if (m2) return { fn: '(anon)', line: +m2[1], col: +m2[2] };
      return null;
    }).filter(Boolean);

    for (const src of sources) {
      console.log('\n--- 动态代码源码 (' + src.len + ' 字符) 关键偏移 ---');
      for (const fr of frames) {
        const off = fr.col; // eval 的 <anonymous>:line:col，col 可能是行内偏移
        // 动态代码是单行 eval？col 即绝对偏移
        if (off < src.source.length) {
          console.log(`\n@${off} (${fr.fn}${fr.as ? ' as ' + fr.as : ''}):`);
          console.log('  ' + src.source.substring(Math.max(0, off - 100), Math.min(src.source.length, off + 300)));
        }
      }
    }
  } else {
    console.log('未捕获到 plain24，记录内容示例:');
    records.slice(0, 5).forEach(r => console.log('  [' + r.tag + '] ' + r.content.slice(0, 24).join(',')));
  }

  await browser.close().catch(() => {});
  process.exit(0);
}

const GT = setTimeout(() => { console.log('!!! 总超时'); process.exit(2); }, 240000);
GT.unref();
main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
