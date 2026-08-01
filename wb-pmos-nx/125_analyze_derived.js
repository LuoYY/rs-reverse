/**
 * 125_analyze_derived.js
 *
 * 分析 95 号保存的 derived 会话：
 *   1. cookie 解码结构（长度/前导）
 *   2. K16 反解外层（keys16==K16 会话）→ keys2 → 对比推导 keys2
 *   3. 对比浏览器 cookie（sync）结构
 * 找 412 根因（keys 错 or basearr 错 or 结构错）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";
const K16 = [0xd7, 0x5a, 0x5c, 0x72, 0xbe, 0xa1, 0xd2, 0x3b, 0x37, 0xc0, 0xcc, 0x02, 0xd1, 0x5f, 0x11, 0xad];

function decodeStr(s) {
  const payload = s.startsWith('0') ? s.slice(1) : s;
  const idxmap = {}; for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const bytes = []; let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]]; qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  return bytes;
}

(async () => {
  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  console.log('derived 会话数:', files.length);
  if (!files.length) process.exit(0);
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[0])));
  console.log('nsd:', s.nsd, 'status:', s.status);
  console.log('offset:', s.offset ? s.offset.map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('推导 keys2:', s.keys2 ? s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('推导 keys17:', s.keys17 ? s.keys17.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('推导 keys16:', s.keys16 ? s.keys16.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' ') : '无');
  console.log('cookie len:', s.cookie.length);

  const cookieVal = s.cookie.split('=')[1];
  const bytes = decodeStr(cookieVal);
  console.log('cookie 解码:', bytes.length, 'B');
  console.log('前 20:', bytes.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // K16 反解外层（时间窗口 ±7200）
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');
  const now = Math.floor(Date.now() / 1000);
  let found = null;
  for (let t = now - 7200; t <= now + 3600 && !found; t++) {
    for (let ele = 1; ele <= 256 && !found; ele++) {
      try {
        const arr = numarrAddTime([...K16], t, ele / 256)[0];
        const dec = encryptMode2([...bytes], arr, 1);
        if (dec.length > 20) {
          const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
          if (calc.every((b, i) => b === dec[i])) found = { t, ele, dec };
        }
      } catch (e) {}
    }
  }
  if (found) {
    const na = found.dec.slice(4);
    console.log('★ 外层反解成功 t=' + found.t, 'ele=' + found.ele);
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const ok2 = s.keys2 && rk2.length === s.keys2.length && rk2.every((v, i) => v === s.keys2[i]);
    console.log('反解 keys2 == 推导 keys2:', ok2 ? '★★★ YES（keys 正确!）' : 'NO');
    console.log('nextarr 前 20:', na.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('nextarr 总长:', na.length);
    // basearr 位置（nextarr 尾部 = 加密的 basearr）
    console.log('nextarr 尾 10:', na.slice(-10).map(b => b.toString(16).padStart(2, '0')).join(' '));
  } else {
    console.log('外层反解失败（K16 可能不匹配该会话）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
