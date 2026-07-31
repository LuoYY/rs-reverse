/**
 * 60_compare_cookies.js
 *
 * 解码对比 原始 P 与 构造 P 的 nextarr 结构
 * 找 412 的差异原因
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeStr(s) {
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(s.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[s[qi]], c1 = idxmap[s[qi + 1]], c2 = idxmap[s[qi + 2]], c3 = idxmap[s[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 2 < s.length) {
    bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4), ((idxmap[s[qi + 1]] & 15) << 4) | (idxmap[s[qi + 2]] >> 2));
  } else if (qi + 1 < s.length) {
    bytes.push((idxmap[s[qi]] << 2) | (idxmap[s[qi + 1]] >> 4));
  }
  return bytes;
}

async function main() {
  // 用 sync 捕获的浏览器 keys 解密两个 P
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');

  // 从 58 脚本输出无法拿到构造 P，改为重新捕获：读取最新 sync（浏览器 keys）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const keys16 = sync.browserKeys.keys16;
  console.log('keys16:', keys16.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 用 sync 的原始 P cookie
  const cookies = sync.cookies;
  const pc = cookies.find(c => c.name.endsWith('P'));
  const oc = cookies.find(c => c.name.endsWith('O'));
  console.log('原始 P len:', pc.value.length, 'O len:', oc.value.length);

  // 解密原始 P
  const bytes = decodeStr(pc.value.slice(1));
  console.log('原始 P 解码:', bytes.length, 'B');
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 3600; t <= now + 3600; t++) {
    for (let ele = 1; ele <= 256; ele++) {
      try {
        const arr = numarrAddTime([...keys16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 100 && dec[4] === 2 && dec[13] === 48) { found = { t, ele, dec }; break; }
      } catch (e) {}
    }
    if (found) break;
  }
  if (!found) {
    console.log('原始 P 解密失败（keys16 可能不匹配或时间窗口太大）');
    return;
  }
  const dec = found.dec;
  console.log('解密 t=' + found.t + ' ele=' + found.ele + ' len=' + dec.length);
  console.log('uuid4:', dec.slice(0, 4).map(b => b.toString(16)).join(''));
  const na = dec.slice(4);
  console.log('nextarr 头 16:', na.slice(0, 16).join(','));
  let pos = 4;
  pos += 1;
  const t4 = na.slice(pos, pos + 4); pos += 4;
  const start4 = na.slice(pos, pos + 4); pos += 4;
  const tVal = (t4[0] << 24 | t4[1] << 16 | t4[2] << 8 | t4[3]) >>> 0;
  console.log('nextarr t4:', t4.map(b => b.toString(16)).join(' '), '=', tVal);
  console.log('  解密时间 t:', found.t, '差:', found.t - tVal);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
