// 分析 nx 站点常量：cd 结构（keys 数/keys[0]/keys[2] 长度）+ basearr seg 划分
// 目标：确定纯 Go 适配需要的站点特定值
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');

const B = 'https://pmos.nx.sgcc.com.cn:10443';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(__dirname, '../../example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');
const { fork } = require('child_process');

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
      if (pLen > 300 && pLen === lastLen) { clearInterval(iv); resolve(c); }  // P 稳定且完整
      lastLen = pLen;
      if (Date.now() - t0 > 40000) { clearInterval(iv); resolve(c); }
    }, 800);
  });
  window.close();
  return cookies;
}

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

// AES-CBC 解密（Node crypto）
const crypto = require('crypto');
function aesCbcDecrypt(data, key16, iv) {
  const d = Buffer.from(data);
  const k = Buffer.from(key16);
  const decipher = crypto.createDecipheriv('aes-128-cbc', k, Buffer.from(iv));
  decipher.setAutoPadding(false);
  return [...decipher.update(d), ...decipher.final()];
}

// 解密 cookie P → nextarr + basearr（完整）
function decryptP(cookieP, keys16, keys17, keys2) {
  const payload = cookieP.startsWith('0') ? cookieP.slice(1) : cookieP;
  const bytes = numarr2stringDecode(payload);
  console.log('  P 字符数:', payload.length, '解码字节数:', bytes.length, '(%16=', bytes.length % 16, ')');
  // 外层 AES-CBC flag=1：前16字节=IV
  const iv = bytes.slice(0, 16);
  const enc = bytes.slice(16);
  const outerDec = aesCbcDecrypt(enc, keys16, iv);
  // strip padding
  const pad = outerDec[outerDec.length - 1];
  const stripped = outerDec.slice(0, outerDec.length - pad);
  const uuid = stripped.slice(0, 4);
  const nextarr = stripped.slice(4);
  // 解析 nextarr
  let idx = 0;
  const tag2 = nextarr[idx], len8 = nextarr[idx + 1]; idx += 2;
  const arr8 = nextarr.slice(idx, idx + 8); idx += 8;
  const keys2len = nextarr[idx]; idx++;
  const k2 = nextarr.slice(idx, idx + keys2len); idx += keys2len;
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
  // 内层 AES-CBC flag=0：零 IV
  const basearrXor = aesCbcDecrypt(basearrEncrypt, keys17, new Array(16).fill(0));
  const pad2 = basearrXor[basearrXor.length - 1];
  const bXor = basearrXor.slice(0, basearrXor.length - pad2);
  // XOR with keys2 (16 bytes cyclic)
  const numenc = bXor.map((b, i) => b ^ keys2[i % 16]);
  const basearr = numarrDecrypt(numenc);
  return { nextarr, keys2len, k2, basearrEncrypt, basearr, hasDebugByte, uuid, arr8 };
}

(async () => {
  console.log('=== nx 站点常量分析 ===');
  const dom0 = await jsdomFromUrl(B + '/', {
    userAgent: UA,
    proxy: 'http://ericshi:583315@120.220.64.185:2018',
    consoleConfig: { error: new Function() },
  });
  const nsd = dom0.window.$_ts.nsd;
  const cd = String(dom0.window.$_ts.cd);
  dom0.window.close();
  console.log('nsd:', nsd, 'cd_len:', cd.length);

  // keys
  const m = await forkKeys(nsd, cd);
  if (!m || !m.keys16 || !m.keys17 || !m.keys2) { console.log('keys 提取失败'); process.exit(1); }
  console.log('keys16:', Buffer.from(m.keys16).toString('hex'));
  console.log('keys17:', Buffer.from(m.keys17).toString('hex'));
  console.log('keys2:', Buffer.from(m.keys2).toString('hex'));

  // cookie → basearr
  const c1 = await genCookieOnce(nsd, cd);
  const P1 = c1.split(';')[1].split('=')[1].trim();
  const r = decryptP(P1, m.keys16, m.keys17, m.keys2);
  console.log('\nbasearr len:', r.basearr.length);
  console.log('basearr:', r.basearr.map(b => b.toString(16).padStart(2, '0')).join(' '));
  fs.writeFileSync('/tmp/nx_basearr_truth.json', JSON.stringify(r.basearr));
  console.log('\n已保存 /tmp/nx_basearr_truth.json');

  // nextarr 结构
  console.log('\nnextarr 结构: tag2=' + r.nextarr[0] + ' len8=' + r.nextarr[1] + ' keys2len=' + r.keys2len);
  console.log('arr8(时间):', r.arr8.map(b => b.toString(16)).join(' '));
  console.log('hasDebugByte:', r.hasDebugByte, 'basearrEncrypt len:', r.basearrEncrypt.length);
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
