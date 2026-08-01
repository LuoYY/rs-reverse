/**
 * 137_decrypt_own_cookie.js
 *
 * 用保存的 runTime/random 反解自己生成的 cookie（95 号 derived 数据）
 * 验证 keys/cookie 结构自洽 → 定位 412（basearr 内容 or 其他）
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
  console.log('nsd:', s.nsd, 'status:', s.status);
  console.log('runTime:', s.runTime, 'random:', s.random, 'codeUid:', s.codeUid);
  console.log('basearr len:', s.basearr ? s.basearr.length : '无');
  console.log('keys16:', s.keys16.slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));

  const bytes = decodeStr(s.cookie.split('=')[1]);
  console.log('cookie 解码:', bytes.length, 'B');

  // 用保存的 runTime 反解（ele 遍历 1-256）
  let found = null;
  for (let ele = 1; ele <= 256 && !found; ele++) {
    try {
      const arr = numarrAddTime([...s.keys16], s.runTime, ele / 256)[0];
      const dec = encryptMode2([...bytes], arr, 1);
      if (dec.length > 20) {
        const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
        if (calc.every((b, i) => b === dec[i])) { found = { ele, dec }; break; }
      }
    } catch (e) {}
  }
  if (found) {
    const na = found.dec.slice(4);
    console.log('★★★ 反解成功 ele=' + found.ele, 'nextarr len:', na.length);
    console.log('nextarr 前 20:', na.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
    const rk2 = na.slice(11, 59);
    console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('推导 keys2:', s.keys2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('keys2 一致:', rk2.every((v, i) => v === s.keys2[i]) ? '★★★ YES（keys 和结构正确!）' : 'NO');
    // basearr 加密段（nextarr 尾部）
    const baEncLen = na[9] === 128 ? ((na[9] & 127) << 8) | na[10] : (na[9] << 8) | na[10];
    console.log('basearr 加密段长度字段:', baEncLen, '（nextarr 尾部实际: ' + na.length + '）');
  } else {
    console.log('反解失败（runTime=' + s.runTime + ' 也不对?）');
    // 扩大时间窗口
    console.log('扩大窗口 ±7200 反解...');
    for (let t = s.runTime - 7200; t <= s.runTime + 7200 && !found; t++) {
      for (let ele = 1; ele <= 256 && !found; ele++) {
        try {
          const arr = numarrAddTime([...s.keys16], t, ele / 256)[0];
          const dec = encryptMode2([...bytes], arr, 1);
          if (dec.length > 20) {
            const calc = parser.numToNumarr4(parser.uuid(dec.slice(4)));
            if (calc.every((b, i) => b === dec[i])) { found = { t, ele, dec }; break; }
          }
        } catch (e) {}
      }
    }
    if (found) {
      console.log('★ 扩大窗口反解成功 t=' + found.t, 'ele=' + found.ele);
      const na = found.dec.slice(4);
      console.log('nextarr 前 20:', na.slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(' '));
      const rk2 = na.slice(11, 59);
      console.log('反解 keys2:', rk2.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('keys2 一致:', rk2.every((v, i) => v === s.keys2[i]) ? '★★★ YES' : 'NO');
    } else {
      console.log('扩大窗口也失败');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
