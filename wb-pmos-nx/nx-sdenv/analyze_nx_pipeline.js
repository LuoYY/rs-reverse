// nx basearr 稳定段分析（管线完整解密，用 sdenv keys 覆盖）
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const { fork } = require('child_process');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

require('module-alias')(path.dirname(require(path.join(__dirname, '../../utils/paths.js')).package));
const gv = require('@src/handler/globalVarible');
const parser = require('@src/handler/parser/');
const { encryptMode2, xor } = parser;

function forkKeys(nsd, cd) {
  return new Promise((resolve) => {
    const child = fork(path.join(__dirname, 'jsdom_keys_child.js'), [], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); resolve(null); }, 25000);
    child.on('message', (m) => { clearTimeout(timer); resolve(m); });
    child.on('error', () => { clearTimeout(timer); resolve(null); });
    child.send({ nsd, cd, outerJsPath: OUTER_JS });
  });
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
    let lastLen = 0;
    const iv = setInterval(() => {
      const c = cookieJar.getCookieStringSync(B + '/');
      const pLen = (c.match(/P=[^;]*/) || [''])[0].length;
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c); }
      lastLen = pLen;
      if (Date.now() - t0 > 40000) { clearInterval(iv); resolve(c); }
    }, 800);
  });
  window.close();
  return cookies;
}
function numarr2stringDecode(str) {
  const bs = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
  const idxmap = {};
  bs.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });
  const numarr = [];
  let i = 0;
  const full = Math.floor(str.length / 4);
  for (let g = 0; g < full; g++) {
    const c0 = idxmap[str[i]], c1 = idxmap[str[i + 1]], c2 = idxmap[str[i + 2]], c3 = idxmap[str[i + 3]];
    i += 4;
    numarr.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - i;
  if (rem === 2) numarr.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4));
  else if (rem === 3) numarr.push((idxmap[str[i]] << 2) | (idxmap[str[i + 1]] >> 4), ((idxmap[str[i + 1]] & 15) << 4) | (idxmap[str[i + 2]] >> 2));
  return numarr;
}
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
// 用管线 encryptMode2 解密（替代手写 crypto）
function decryptP(P, keys16, keys17, keys2) {
  const payload = P.startsWith('a') ? P.slice(1) : P;
  const bytes = numarr2stringDecode(payload);
  // 外层：flag=1（IV 前置）
  const outerDec = encryptMode2(bytes, keys16, 1);
  const nextarr = outerDec.slice(4);
  let idx = 2 + 8;
  const keys2len = nextarr[idx]; idx++;
  idx += keys2len;
  let rest = nextarr.slice(idx);
  let basearrEncrypt;
  if ((rest[0] & 0x80) === 0x80) {
    const encLen = rest[1] | ((rest[0] & 0x7f) << 8);
    basearrEncrypt = rest.slice(2, 2 + encLen);
  } else {
    basearrEncrypt = rest.slice(1, 1 + rest[0]);
  }
  // 内层：flag=0
  const basearrXor = encryptMode2([...basearrEncrypt], keys17, 0);
  const numenc = xor([...basearrXor], keys2, 16);
  return numarrDecrypt(numenc);
}

(async () => {
  console.log('=== nx basearr 稳定段分析（管线）===');
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
  console.log('keys16/17/2 OK');

  // 初始化管线基础（gv 需要 cfgnum）
  gv._setAttr('basestr', "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^");
  require('@src/handler/parser/constData').init();
  // 测试 encryptMode2
  const test = encryptMode2(Array.from({ length: 32 }, (_, i) => i), m.keys16, 1);
  console.log('encryptMode2 test len:', test.length);

  const c1 = await genCookieOnce(nsd, cd);
  const c2 = await genCookieOnce(nsd, cd);
  const P1 = c1.split(';')[1].split('=')[1].trim();
  const P2 = c2.split(';')[1].split('=')[1].trim();
  const b1 = decryptP(P1, m.keys16, m.keys17, m.keys2);
  const b2 = decryptP(P2, m.keys16, m.keys17, m.keys2);
  console.log('\nb1 len:', b1.length, 'b2 len:', b2.length);

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
    console.log(`  [${s}:${e}] len=${e - s + 1}: ${b1.slice(s, Math.min(e + 1, s + 20)).join(',')}${e - s + 1 > 20 ? '...' : ''}`);
  });
  console.log(`稳定总字节: ${stableTotal}/${len}`);
  console.log('\n=== 变化段 ===');
  for (let i = 0; i < len; i++) {
    if (b1[i] !== b2[i]) console.log(`  @${i}: ${b1[i]} vs ${b2[i]}`);
  }
  fs.writeFileSync('/tmp/nx_basearr_c1.json', JSON.stringify(b1));
  fs.writeFileSync('/tmp/nx_basearr_c2.json', JSON.stringify(b2));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
