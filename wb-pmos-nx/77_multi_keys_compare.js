/**
 * 77_multi_keys_compare.js
 *
 * 多会话：浏览器 keys（reload 后数组陷阱）+ jsdom keys（同 cd）对比
 * 目标：验证 jsdom keys2 XOR 浏览器 keys2 是否跨会话恒定（掩码）
 * 若恒定 → 从 jsdom keys 推导浏览器 keys → 纯算法！
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { chromium } = require('patchright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PROXY = { server: 'http://140.249.234.175:2022', username: '74940609', password: 'aFmWc5Fs' };
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

function isKeys16(a) { return a.length === 16 && a.every((b, i) => b === K16[i]); }
function isShape17(t8) {
  if (!Array.isArray(t8) || t8.length !== 8) return false;
  return t8[1] >= 128 && t8[4] >= 2 && t8[4] <= 5 && t8[6] >= 4 && t8[6] <= 7 && t8[7] >= 2 && t8[7] <= 7;
}
function isDomainArr(a) { return a.length === 16 && a[0] === 0x31 && a[1] === 0x3a; }  // "1:"
// keys2 特征：48 字节随机（全字节合法 + ascii < 40%——排除域名/文本/非字节）
function isRandom48(a) {
  if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return false;
  return a.filter(b => b >= 32 && b <= 126).length < a.length * 0.4;
}

/** 浏览器 keys（reload 后数组陷阱） */
async function browserKeys(browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, userAgent: UA, proxy: PROXY });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Runtime.enable');
  let challenge = null;
  let oCookie = '';
  page.on('response', async (resp) => {
    if (resp.status() === 412 && !challenge) {
      try {
        const body = await resp.text();
        const nsdM = body.match(/\$_ts\.nsd\s*=\s*(\d+)/);
        const cdM = body.match(/\$_ts\.cd\s*=\s*"([^"]+)"/);
        challenge = { nsd: nsdM ? +nsdM[1] : null, cd: cdM ? cdM[1] : null };
        const sc = [].concat(resp.headers()['set-cookie'] || []);
        oCookie = sc.map(c => c.split(';')[0]).find(c => /O=/.test(c)) || '';
      } catch (e) {}
    }
  });
  await page.goto(TARGET, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.reload({ timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(15000);
  // 从 context cookies 抓 O（页面加载后）
  try {
    const cks = await context.cookies();
    const oc = cks.find(c => c.name.endsWith('O'));
    if (oc) oCookie = oc.name + '=' + oc.value;
  } catch (e) {}
  // reload 后注入数组陷阱
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){
      var records = [];
      window.__tr = records;
      var O_PUSH = Array.prototype.push;
      function copyArr(arr) { var c = []; for (var i = 0; i < Math.min(arr.length, 60); i++) O_PUSH.call(c, arr[i]); return c; }
      function record(arr) { if (records.length < 200 && (arr.length === 16 || arr.length === 48)) { var ok = arr.length > 0; for (var i = 0; i < arr.length; i++) if (typeof arr[i] !== 'number') { ok = false; break; } if (ok) records.push(copyArr(arr)); } }
      var op = Array.prototype.push;
      Array.prototype.push = function() { try { var nl = this.length + arguments.length; if (nl === 16 || nl === 48) { var c = []; for (var i = 0; i < this.length; i++) O_PUSH.call(c, this[i]); for (var j = 0; j < arguments.length; j++) O_PUSH.call(c, arguments[j]); record(c); } } catch(e) {} return op.apply(this, arguments); };
      var os = Array.prototype.slice;
      Array.prototype.slice = function() { try { var r = os.apply(this, arguments); if (r && (r.length === 16 || r.length === 48)) record(r); return r; } catch(e) { return os.apply(this, arguments); } };
      var oc = Array.prototype.concat;
      Array.prototype.concat = function() { try { var r = oc.apply(this, arguments); if (r && (r.length === 16 || r.length === 48)) record(r); return r; } catch(e) { return oc.apply(this, arguments); } };
      var om = Array.prototype.map;
      Array.prototype.map = function() { try { var r = om.apply(this, arguments); if (r && (r.length === 16 || r.length === 48)) record(r); return r; } catch(e) { return om.apply(this, arguments); } };
      return 'ok';
    })()`,
    returnByValue: true,
  });
  await cdp.send('Runtime.evaluate', {
    expression: `(function(){try{var x=new XMLHttpRequest();x.open('POST','/px-gateway/GatewayConfig/getGatewayConfig',false);x.setRequestHeader('Content-Type','application/json');x.send('{}');return x.status}catch(e){return e.message}})()`,
    returnByValue: true,
  });
  const recsR = await cdp.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__tr || [])', returnByValue: true });
  let recs = [];
  try { recs = JSON.parse(recsR.result.value); } catch (e) {}
  await context.close();
  // 识别 keys
  const k16s = [], k17s = [], k48s = [];
  for (const a of recs) {
    if (a.length === 16) {
      if (isKeys16(a)) k16s.push(a);
      else if (!isDomainArr(a) && isShape17(a.slice(8))) k17s.push(a);
    } else if (a.length === 48) k48s.push(a);
  }
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  // debug：打印 48 字节候选
  const d48 = dedup(k48s);
  if (d48.length) {
    console.log('  48 字节候选:', d48.length, '个');
    d48.forEach((a, i) => {
      const asciiRatio = a.filter(b => b >= 32 && b <= 126).length / 48;
      console.log(`    [${i}] ascii=${asciiRatio.toFixed(2)} 前6: ${a.slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    });
  }
  return {
    challenge, oCookie,
    keys16: dedup(k16s)[0] || null,
    keys17: dedup(k17s)[0] || null,
    keys2: dedup(k48s.filter(isRandom48)).sort((a, b) => { const ca = k48s.filter(x => x.join(',') === a.join(',')).length; const cb = k48s.filter(x => x.join(',') === b.join(',')).length; return cb - ca; })[0] || null,
    recCount: recs.length,
  };
}

/** jsdom keys（同 cd + O cookie 数组陷阱）——xj 方法：必须传 O，否则 keys 派生错误 */
async function jsdomKeys(nsd, cd, oCookie) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET, referrer: TARGET, contentType: 'text/html', userAgent: UA,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const { window } = dom;
  window.$_ts = { nsd, cd };
  // 传入 O cookie（关键：瑞数 keys 派生依赖 O）
  if (oCookie) {
    let cj = oCookie;
    Object.defineProperty(window.document, 'cookie', {
      get() { return cj; }, set(v) { cj = cj ? cj + '; ' + v : v; }, configurable: true,
    });
  }
  const found = [];
  const rec = (arr) => {
    if (!arr || typeof arr !== 'object') return;
    const a = Array.isArray(arr) ? arr : (ArrayBuffer.isView(arr) ? Array.from(arr) : null);
    if (!a) return;
    if (a.length !== 16 && a.length !== 48) return;
    if (!a.every(b => typeof b === 'number' && b >= 0 && b <= 255)) return;
    found.push(a);
  };
  for (const C of [window.Array, window.Uint8Array]) {
    if (!C) continue;
    for (const m of ['slice', 'concat', 'map', 'filter', 'flat', 'subarray']) {
      const o = C.prototype[m];
      if (typeof o === 'function') C.prototype[m] = function () { const r = o.apply(this, arguments); rec(r); return r; };
    }
  }
  const of = window.Array.from;
  if (of) window.Array.from = function () { const r = of.apply(this, arguments); rec(r); return r; };
  try { window.eval(fs.readFileSync(OUTER_JS, 'utf8')); await new Promise(r => setTimeout(r, 10000)); } catch (e) {}
  window.close();
  // 识别 keys2（48 字节，非 ASCII 主导）
  const k48s = found.filter(a => a.length === 48);
  const dedup = (arrs) => [...new Map(arrs.map(a => [a.join(','), a])).values()];
  return { keys16: dedup(found.filter(a => a.length === 16 && isKeys16(a)))[0] || null, keys2: dedup(k48s.filter(isRandom48))[0] || null, k48Count: k48s.length };
}

async function main() {
  const n = parseInt(process.argv[2] || '3');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
  const sessions = [];
  try {
    for (let si = 0; si < n; si++) {
      console.log(`\n===== 会话 ${si} =====`);
      const br = await browserKeys(browser);
      if (!br.challenge || !br.keys2) { console.log('浏览器数据不完整，跳过'); continue; }
      console.log('浏览器 nsd:', br.challenge.nsd, 'O:', br.oCookie ? br.oCookie.substring(0, 30) : '无', 'keys2:', br.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      const js = await jsdomKeys(br.challenge.nsd, br.challenge.cd, br.oCookie);
      console.log('jsdom keys2:', js.keys2 ? js.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
      if (js.keys2 && br.keys2) {
        const same = br.keys2.length === js.keys2.length && br.keys2.every((v, i) => v === js.keys2[i]);
        console.log('keys2 相同:', same ? 'YES' : 'NO');
        if (!same) {
          const xor = js.keys2.slice(0, 48).map((v, i) => v ^ br.keys2[i]);
          sessions.push({ nsd: br.challenge.nsd, xor, js2: js.keys2, br2: br.keys2 });
          console.log('XOR 前16:', xor.slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(' '));
          // 段对比：找 jsdom/浏览器 keys2 中相同的段
          const jsFull = js.keys2, brFull = br.keys2;
          let sameBytes = 0; const samePos = [];
          for (let i = 0; i < 48; i++) if (jsFull[i] === brFull[i]) { sameBytes++; samePos.push(i); }
          console.log('相同字节:', sameBytes, '/48', samePos.length ? '位置: ' + samePos.join(',') : '');
          // 前 16 / 中 16 / 后 16 的 XOR 是否像 ASCII（环境段特征）
          console.log('jsdom keys2 完整:', jsFull.map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      }
    }
  } finally { await browser.close(); }
  // 跨会话 XOR 对比 + 段结构分析
  console.log('\n===== 跨会话 keys2 段结构分析 =====');
  if (sessions.length >= 2) {
    const same = sessions[0].xor.every((v, i) => v === sessions[1].xor[i]);
    console.log('会话0 vs 1 XOR 相同:', same ? '★★★ 恒定掩码!' : 'NO（无恒定 XOR）');
    // jsdom keys2 跨会话是否有恒定段（可能是环境无关部分）
    const j0 = sessions[0].js2, j1 = sessions[1].js2;
    const jsSamePos = [];
    for (let i = 0; i < 48; i++) if (j0[i] === j1[i]) jsSamePos.push(i);
    console.log('jsdom keys2 跨会话相同段:', jsSamePos.length ? jsSamePos.join(',') : '无（jsdom 也全随机会话）');
    // 浏览器 keys2 跨会话恒定段（可能 = 站点常量/环境指纹）
    const b0 = sessions[0].br2, b1 = sessions[1].br2;
    const brSamePos = [];
    for (let i = 0; i < 48; i++) if (b0[i] === b1[i]) brSamePos.push(i);
    console.log('浏览器 keys2 跨会话相同段:', brSamePos.length ? brSamePos.join(',') : '无（浏览器也全随机会话）');
  }
  sessions.forEach((s, i) => {
    console.log(`会话${i} nsd=${s.nsd} 浏览器keys2前8: ${s.br2.slice(0, 8).map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
  });
  const fname = path.join(OUT, 'keys_compare_' + Date.now() + '.json');
  fs.writeFileSync(fname, JSON.stringify(sessions, null, 2));
  console.log('已保存:', fname);
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
