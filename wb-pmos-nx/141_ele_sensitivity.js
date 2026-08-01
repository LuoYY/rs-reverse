/**
 * 141_ele_sensitivity.js
 *
 * 1. 验证 ele 敏感性（numarrAddTime 的 ele 是否影响 getCfg 加密）
 * 2. 若 ele 不敏感 → 外层解密只需遍历 runTime → 大窗口反解 sync 浏览器 cookie → basearr 明文
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
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  // 1. ele 敏感性验证
  const plain = Array.from({ length: 80 }, (_, i) => (i * 3 + 7) % 256);
  const rt = Math.floor(Date.now() / 1000);
  const enc32 = encryptMode1([...plain], numarrAddTime([...K16], rt, 32 / 256)[0], 1, 0.5);
  const dec1 = encryptMode2([...enc32], numarrAddTime([...K16], rt, 1 / 256)[0], 1);
  const dec32 = encryptMode2([...enc32], numarrAddTime([...K16], rt, 32 / 256)[0], 1);
  const same1 = dec1.length === plain.length && dec1.every((v, i) => v === plain[i]);
  const same32 = dec32.length === plain.length && dec32.every((v, i) => v === plain[i]);
  console.log('ele=32 加密 → ele=1 解密:', same1 ? '成功（ele 不敏感!）' : '失败（ele 敏感）');
  console.log('ele=32 加密 → ele=32 解密:', same32 ? '成功' : '失败');

  // 2. 若 ele 不敏感 → 大窗口反解 sync 浏览器 cookie
  if (same1) {
    console.log('\nele 不敏感 → 只遍历 runTime 反解 sync cookie');
    const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
    const bP = (sync.cookies || []).find(c => c.name.endsWith('P'));
    const bytes = decodeStr(bP.value);
    const center = Math.floor(sync.capturedAt / 1000);
    console.log('sync cookie 解码:', bytes.length, 'B, 时间中心:', center);
    let found = null;
    const t0 = Date.now();
    for (let t = center - 172800; t <= center + 172800 && !found; t++) {
      const arr = numarrAddTime([...K16], t, 1 / 256)[0];
      const dec = encryptMode2([...bytes], arr, 1);
      if (dec.length > 20) {
        const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
        if (calc.every((b, i) => b === dec[i])) { found = { t, dec }; break; }
      }
    }
    console.log('耗时:', Date.now() - t0, 'ms');
    if (found) {
      console.log('★★★ 反解成功 t=' + found.t, new Date(found.t * 1000).toISOString());
      const na = found.dec.slice(4);
      console.log('nextarr 前 20:', na.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
      const rk2 = na.slice(11, 59);
      console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      // basearr 加密段
      const baLen = (na[9] << 8) | na[10];
      console.log('basearr 加密段 len 字段:', baLen, '实际剩余:', na.length - 11);
      console.log('nextarr 总长:', na.length);
      fs.writeFileSync(path.join(OUT, 'sync_decrypted.json'), JSON.stringify({ t: found.t, dec: found.dec, nextarr: na }));
    } else {
      console.log('大窗口反解失败');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
