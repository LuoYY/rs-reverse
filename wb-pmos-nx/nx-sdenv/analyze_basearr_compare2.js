// basearr 确定性对比 v2：完整初始化管线 + 解密两次 cookie
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const gv = require('@src/handler/globalVarible');
const { initGv } = require('@utils/');
const parser = require('@src/handler/parser/');
const { encryptMode1, encryptMode2, xor } = parser;

// huffman decode（从 decrypt_cookie.js 复制）
function getTree() {
  let arr = [];
  for (let i = 1; i < 255; i++) arr.push({ total: 1, idx: i });
  arr.push({ total: 6, idx: 255 }, { total: 45, idx: 0 });
  function parse(item) {
    for (let i = 0; i < arr.length; i++) {
      if (item.total <= arr[i].total) { arr.splice(i, 0, item); return; }
    }
    arr.push(item);
  }
  while (arr.length > 1) {
    const [one, two] = arr.slice(0, 2);
    arr = arr.slice(2);
    parse({ total: one.total + two.total, first: one, second: two });
  }
  return arr[0];
}
function getKey(arr) {
  for (let idx in arr) { if (arr[idx].val >= 8) return arr[idx].key >> arr[idx].val - 8; }
}
function getEncryptConfig(tree, config = { key: 0, val: 0 }, arr = []) {
  if (tree.idx === undefined) {
    getEncryptConfig(tree.first, { key: config.key << 1, val: config.val + 1 }, arr);
    getEncryptConfig(tree.second, { key: (config.key << 1) + 1, val: config.val + 1 }, arr);
  } else { arr[tree.idx] = config; }
  return [arr, getKey(arr)];
}
const encryptConfig = getEncryptConfig(getTree());
const codeMap = {};
for (let b = 0; b < 256; b++) {
  const c = encryptConfig[0][b];
  if (!c) continue;
  if (!codeMap[c.val]) codeMap[c.val] = {};
  codeMap[c.val][c.key] = b;
}
function numarrDecrypt(numarr) {
  const ans = [];
  let curLen = 0, curKey = 0;
  for (let i = 0; i < numarr.length; i++) {
    const byte = numarr[i];
    for (let bit = 7; bit >= 0; bit--) {
      const b = (byte >> bit) & 1;
      curKey = (curKey << 1) | b;
      curLen++;
      const m = codeMap[curLen];
      if (m && m[curKey] !== undefined) { ans.push(m[curKey]); curKey = 0; curLen = 0; }
    }
  }
  return ans;
}
function numarr2stringDecode(str) {
  const keys = gv.basestr.split('');
  const idxmap = {};
  keys.forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const numarr = [];
  let i = 0;
  const full = Math.floor(str.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[str[i]], c1 = idxmap[str[i + 1]], c2 = idxmap[str[i + 2]], c3 = idxmap[str[i + 3]];
    i += 4;
    numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - i;
  if (rem === 2) { numarr.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4)); }
  else if (rem === 3) { numarr.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4), ((idxmap[str[i + 1]] & 15) << 4) | (idxmap[str[i + 2]] >> 2)); }
  return numarr;
}

const { fork } = require('child_process');
function forkKeys(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 20000);
    child.on('message', (m) => { clearTimeout(timer); resolve(m); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
}

// 解密 P → basearr
function decryptP(cookieP, keys16, keys17, keys2) {
  const payload = cookieP.startsWith('0') ? cookieP.slice(1) : cookieP;
  const bytes = numarr2stringDecode(payload);
  const outerDec = encryptMode2(bytes, keys16, 1);
  const nextarr = outerDec.slice(4);
  let idx = 2 + 8;
  const keys2len = nextarr[idx]; idx++;
  idx += keys2len;
  let rest = nextarr.slice(idx);
  let basearrEncrypt;
  const hasDebugByte = (rest[0] & 0x80) === 0x80;
  if (hasDebugByte) {
    const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
    basearrEncrypt = rest.slice(2, 2 + encLen);
  } else {
    const encLen = rest[0];
    basearrEncrypt = rest.slice(1, 1 + encLen);
  }
  const basearrXor = encryptMode2([...basearrEncrypt], keys17, 0);
  const numenc = xor([...basearrXor], keys2, 16);
  return numarrDecrypt(numenc);
}

async function genCookieOnce(nsd, cd) {
  const dom = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const { window, cookieJar } = dom;
  window.$_ts.nsd = nsd;
  window.$_ts.cd = cd;
  const cookies = await new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const c = cookieJar.getCookieStringSync(B + '/');
      if ((c.includes('O=') && c.includes('P=')) || Date.now() - t0 > 30000) { clearInterval(iv); resolve(c); }
    }, 500);
  });
  window.close();
  return cookies;
}

(async () => {
  console.log('=== basearr 确定性对比 v2 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();

  const m = await forkKeys(nsd, cd);
  if (!m || !m.keys16 || !m.keys17 || !m.keys2) { console.log('keys 提取失败'); process.exit(1); }

  // 初始化管线（用提取的 keys 构造 ts.json）
  const tsJson = { nsd, cd, keys: {} };
  for (let i = 0; i <= 40; i++) tsJson.keys[i] = i === 2 ? m.keys2 : (i === 16 ? m.keys16 : (i === 17 ? m.keys17 : []));
  fs.writeFileSync('/tmp/nx_ts_analyze.json', JSON.stringify(tsJson));
  const codeRet = { jscode: 'window.$_ts={};', appcode: '' };
  const argv = { file: '/tmp/nx_ts_analyze.json', jsurls: codeRet };
  gv.wrap(initGv)(argv);
  gv._setAttr('basestr', "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^");
  require('@src/handler/parser/constData').init();
  console.log('gv 初始化完成, keys[2] len:', gv.keys[2].length, 'keys[16]:', gv.keys[16].length);

  // 测试 encryptMode2
  const test = encryptMode2(Array.from({ length: 32 }, (_, i) => i), m.keys16, 0);
  console.log('encryptMode2 测试 len:', test.length);

  // 生成两次 cookie
  const c1 = await genCookieOnce(nsd, cd);
  const c2 = await genCookieOnce(nsd, cd);
  const P1 = c1.split(';')[1].split('=')[1].trim();
  const P2 = c2.split(';')[1].split('=')[1].trim();

  const b1 = decryptP(P1, m.keys16, m.keys17, m.keys2);
  const b2 = decryptP(P2, m.keys16, m.keys17, m.keys2);
  console.log('\nbasearr1 len:', b1.length, 'basearr2 len:', b2.length);

  const len = Math.min(b1.length, b2.length);
  let segStart = -1;
  const stableSegs = [];
  for (let i = 0; i < len; i++) {
    if (b1[i] === b2[i]) { if (segStart < 0) segStart = i; }
    else { if (segStart >= 0) { stableSegs.push([segStart, i - 1]); segStart = -1; } }
  }
  if (segStart >= 0) stableSegs.push([segStart, len - 1]);
  let stableTotal = 0;
  console.log('\n=== 稳定段 ===');
  stableSegs.forEach(([s, e]) => {
    stableTotal += e - s + 1;
    console.log(`  [${s}:${e}] len=${e - s + 1}: ${b1.slice(s, Math.min(e + 1, s + 24)).map(x => x.toString(16).padStart(2, '0')).join(' ')}${e - s + 1 > 24 ? '...' : ''}`);
  });
  console.log(`稳定总字节: ${stableTotal}/${len}`);

  console.log('\n=== 变化段 ===');
  for (let i = 0; i < len; i++) {
    if (b1[i] !== b2[i]) console.log(`  @${i}: ${b1[i].toString(16)} vs ${b2[i].toString(16)}`);
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
