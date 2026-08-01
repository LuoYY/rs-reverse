/**
 * 142_wide_decrypt.js
 *
 * 大窗口反解 derived cookie（只遍历 runTime，ele 不敏感）：
 * 用推导 keys16=K16 + 遍历时间 → 找到 uuid 匹配 → nextarr → basearr 加密段
 * 验证：反解 keys2 == 推导 keys2 → keys/cookie 结构正确 → basearr 是 412 唯一原因
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

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
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const files = fs.readdirSync(OUT).filter(f => f.startsWith('derived_412_')).sort();
  const s = JSON.parse(fs.readFileSync(path.join(OUT, files[files.length - 1])));
  const bytes = decodeStr(s.cookie.split('=')[1]);
  const center = Math.floor(s.capturedAt / 1000);
  console.log('nsd:', s.nsd, 'cookie 解码:', bytes.length, 'B, 时间中心:', center, '保存 runTime:', s.runTime);

  // 大窗口遍历（只时间，ele 固定 1）
  let found = null;
  const t0 = Date.now();
  for (let t = center - 864000; t <= center + 864000 && !found; t++) {
    const arr = numarrAddTime([...s.keys16], t, 1 / 256)[0];
    let dec;
    try { dec = encryptMode2([...bytes], arr, 1); } catch (e) { continue; }
    if (dec.length > 20) {
      const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
      if (calc.every((b, i) => b === dec[i])) { found = { t, dec }; break; }
    }
    if ((t - center) % 50000 === 0) console.log('  进度:', t - center);
  }
  console.log('耗时:', Date.now() - t0, 'ms');
  if (found) {
    console.log('★★★ 反解成功 t=' + found.t, new Date(found.t * 1000).toISOString());
    const na = found.dec.slice(4);
    console.log('nextarr 总长:', na.length);
    console.log('nextarr 前 16:', na.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 一致:', rk2.every((v, i) => v === s.keys2[i]) ? '★★★ YES' : 'NO');
    // basearr 加密段
    const baLenHi = na[9], baLenLo = na[10];
    const baLen = ((baLenHi & 127) << 8) | baLenLo;
    console.log('basearr 加密段 len 字段:', baLen, '（high=' + baLenHi + '）剩余:', na.length - 11);
    console.log('basearr 加密段前 16:', na.slice(11, 27).map(b => b.toString(16).padStart(2, '0')).join(' '));
    fs.writeFileSync(path.join(OUT, 'derived_decrypted.json'), JSON.stringify({ nsd: s.nsd, t: found.t, nextarr: na, keys2: s.keys2 }));
    console.log('已保存 derived_decrypted.json');
  } else {
    console.log('大窗口反解失败（keys16 可能不是该 cookie 的外层密钥）');
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
