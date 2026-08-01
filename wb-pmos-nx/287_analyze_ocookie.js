/**
 * 287_analyze_ocookie.js
 *
 * 分析 O cookie 结构 + keys2 与 nsd/pureK2 相关性
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);

function decodeB86(str) {
  const idxmap = {}; for (let i = 0; i < B86_64.length; i++) idxmap[B86_64[i]] = i;
  const bytes = []; let qi = 0;
  for (let g = 0; g < Math.floor(str.length / 4); g++) {
    const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
    if (c0 === undefined) return null;
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  const rem = str.length - qi;
  if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
  else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
  return bytes;
}

(async () => {
  // 收集多个会话的 keys2
  const sessions = [];
  for (const f of fs.readdirSync(OUT).filter(f => f.startsWith('fresh_')).sort()) {
    const s = JSON.parse(fs.readFileSync(path.join(OUT, f)));
    sessions.push(s);
  }
  // sync（有 browserKeys + nextarr）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  console.log('sync nsd:', sync.challenge.nsd);
  if (sync.cookies) {
    const oc = sync.cookies.find(c => c.name.endsWith('O'));
    const pc = sync.cookies.find(c => c.name.endsWith('P'));
    if (oc) {
      console.log('O cookie len:', oc.value.length, '前 8:', oc.value.substring(0, 8));
      const oBytes = decodeB86(oc.value);
      console.log('O 解码:', oBytes ? oBytes.length + 'B 前 16: ' + oBytes.slice(0, 16).join(',') : '无法解码');
    }
    if (pc) {
      console.log('P cookie len:', pc.value.length);
    }
  }
  // fresh 会话的 O cookie
  for (const s of sessions) {
    if (s.oCookie) {
      console.log('fresh nsd=' + s.nsd, 'O len:', s.oCookie.value.length, '前 8:', s.oCookie.value.substring(0, 8));
      const oBytes = decodeB86(s.oCookie.value);
      console.log('  O 解码:', oBytes ? oBytes.length + 'B 前 16: ' + oBytes.slice(0, 16).join(',') : '无法解码');
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
