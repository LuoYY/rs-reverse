/**
 * 247_verify_pipeline_encrypt.js
 *
 * 用管线原生 numarrEncrypt 编码解码出的 basearr，对比 Ereal
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

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
function numarrDecrypt(bytes) {
  const tree = getTree();
  let bits = '';
  for (let i = 0; i < bytes.length; i++) bits += bytes[i].toString(2).padStart(8, '0');
  const out = [];
  let node = tree;
  for (let i = 0; i < bits.length; i++) {
    node = bits[i] === '0' ? node.first : node.second;
    if (node && node.idx !== undefined) { out.push(node.idx); node = tree; }
  }
  return out;
}

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const nextarr = plain.slice(4);
  const K2P = [165, 114, 155, 62, 19, 210, 122, 197];
  const keys2 = dedup.find(a => a.length === 48 && a.slice(0, 8).every((v, i) => v === K2P[i]));
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);

  const k17 = [214, 230, 119, 17, 138, 168, 165, 180, 7, 158, 3, 0, 5, 5, 6, 7];
  const arr = numarrAddTime([...k17], 0, 1 / 256)[0];
  const Xreal = encryptMode2([...target], arr, 0);
  const Ereal = Xreal.slice();
  for (let i = 0; i < 16 && i < Ereal.length; i++) Ereal[i] ^= keys2[i];
  console.log('Ereal:', Ereal.length, 'B');

  const ba = numarrDecrypt(Ereal);
  console.log('解码 basearr:', ba.length, 'B');

  // 管线 numarrEncrypt
  try {
    const enc = numarrEncrypt([...ba]);
    console.log('管线 numarrEncrypt:', enc.length, 'B');
    console.log('匹配 Ereal:', enc.length === Ereal.length && enc.every((v, i) => v === Ereal[i]) ? '★★★ YES' : 'NO');
    let fd = -1;
    for (let i = 0; i < Math.min(enc.length, Ereal.length); i++) if (enc[i] !== Ereal[i]) { fd = i; break; }
    console.log('首个差异 @', fd, 'enc 尾:', enc.slice(-4).join(','), 'Ereal 尾:', Ereal.slice(-4).join(','));
    // 试截断 basearr
    for (let cut = 0; cut <= 20; cut++) {
      const enc2 = numarrEncrypt([...ba.slice(0, ba.length - cut)]);
      if (enc2.length === Ereal.length && enc2.every((v, i) => v === Ereal[i])) {
        console.log('★★★ 管线编码 截断 ' + cut + ' 字符后完全匹配! basearr=' + (ba.length - cut) + 'B');
        fs.writeFileSync(path.join(OUT, 'basearr_jsdom_final.json'), JSON.stringify({ cut, basearr: ba.slice(0, ba.length - cut) }));
      }
    }
  } catch (e) { console.log('numarrEncrypt 错误:', e.message.substring(0, 60)); }

  // 反向：管线 numarrEncrypt 的 padding（getKey 0x68）验证
  console.log('\ngetKey 测试：');
  const gv = require('@src/handler/globalVarible');
  console.log('gv.config.adapt:', JSON.stringify(gv.config && gv.config.adapt).substring(0, 100));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
