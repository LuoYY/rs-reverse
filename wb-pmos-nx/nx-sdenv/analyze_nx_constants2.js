// nx cookie P 前缀分析 + 正确解密
const fs = require('fs');
const path = require('path');
const { jsdomFromUrl } = require('sdenv');
const crypto = require('crypto');

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

// 正确的 AES-CBC 解密（flag=1：IV 前置；flag=0：零 IV）
function aesDecrypt(data, key16, ivBytes) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key16), Buffer.from(ivBytes));
  decipher.setAutoPadding(false);
  return [...decipher.update(Buffer.from(data)), ...decipher.final()];
}

(async () => {
  console.log('=== nx cookie 前缀 + 解密 ===');
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
  console.log('keys16:', Buffer.from(m.keys16).toString('hex'));
  console.log('keys17:', Buffer.from(m.keys17).toString('hex'));

  const c1 = await genCookieOnce(nsd, cd);
  const parts = c1.split(';').map(s => s.trim());
  console.log('\ncookie parts:', parts.length);
  parts.forEach((p, i) => {
    const v = p.split('=')[1] || '';
    console.log(`  part${i}: ${p.split('=')[0]} len=${v.length} 首字符=${v[0]} (${v.charCodeAt(0)})`);
  });

  const P = parts[1].split('=')[1];
  // 尝试不同前缀剥离
  for (const strip of [0, 1]) {
    const payload = strip ? P.slice(1) : P;
    const bytes = numarr2stringDecode(payload);
    console.log(`\n[strip=${strip}] payload len=${payload.length} 解码=${bytes.length} %16=${bytes.length % 16}`);
    if (bytes.length % 16 === 0 && bytes.length >= 32) {
      const iv = bytes.slice(0, 16);
      const enc = bytes.slice(16);
      try {
        const dec = aesDecrypt(enc, m.keys16, iv);
        const pad = dec[dec.length - 1];
        const stripped = dec.slice(0, dec.length - pad);
        console.log(`  解密成功! uuid=${stripped.slice(0, 4)} nextarr 前16=${stripped.slice(4, 20)}`);
        break;
      } catch (e) { console.log('  解密失败:', e.message); }
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
