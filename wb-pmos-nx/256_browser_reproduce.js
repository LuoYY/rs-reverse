/**
 * 256_browser_reproduce.js
 *
 * 浏览器 basearr（317B）重现 basearrEncrypt（304B）验证
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
  const { encryptMode1, encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const numarrEncrypt = require('@src/handler/parser/common/numarrEncrypt');

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  const K2P = bk.keys2.slice(0, 8);
  let k2pos = -1;
  for (let i = 0; i + 8 <= nextarr.length; i++) {
    if (nextarr.slice(i, i + 8).every((v, j) => v === K2P[j])) { k2pos = i; break; }
  }
  const flag = nextarr[k2pos + 48], N = nextarr[k2pos + 49];
  const len = N + ((flag & 128) ? ((flag & 127) << 8) : 0);
  const target = nextarr.slice(k2pos + 50, k2pos + 50 + len);
  console.log('target basearrEncrypt:', target.length, 'B');

  // basearr（browser keys17 解密）
  const arr0 = numarrAddTime([...bk.keys17], 0, 1 / 256)[0];
  const X0 = encryptMode2([...target], arr0, 0);
  const E0 = X0.slice();
  for (let i = 0; i < 16 && i < E0.length; i++) E0[i] ^= bk.keys2[i];
  const ba = numarrDecrypt(E0);
  console.log('解码 basearr:', ba.length, 'B 首:', ba[0], ba[1]);

  // 重现 basearrEncrypt
  const E = numarrEncrypt([...ba]);
  console.log('numarrEncrypt:', E.length, 'B vs Ereal:', E0.length, 'B');
  let fd = -1;
  for (let i = 0; i < Math.min(E.length, E0.length); i++) if (E[i] !== E0[i]) { fd = i; break; }
  console.log('E 差异 @', fd);

  const X = E.slice();
  for (let i = 0; i < 16 && i < X.length; i++) X[i] ^= bk.keys2[i];
  const arr = numarrAddTime([...bk.keys17], 0, 1 / 256)[0];
  const re = encryptMode1([...X], arr, 0);
  console.log('重现 basearrEncrypt:', re.length, 'B vs target:', target.length, 'B');
  let fd2 = -1;
  for (let i = 0; i < Math.min(re.length, target.length); i++) if (re[i] !== target[i]) { fd2 = i; break; }
  console.log('basearrEncrypt 差异 @', fd2);
  if (fd2 >= 0) {
    console.log('  target @差异:', target.slice(Math.max(0, fd2 - 4), fd2 + 8).join(','));
    console.log('  re     @差异:', re.slice(Math.max(0, fd2 - 4), fd2 + 8).join(','));
  }
  if (re.length === target.length && re.every((v, i) => v === target[i])) {
    console.log('★★★ 浏览器 basearr 完整重现成功!');
  }

  // 暴力修复尾部（keep 变体）
  for (let cut = 0; cut <= 5; cut++) {
    const sub = ba.slice(0, ba.length - cut);
    const E2 = numarrEncrypt([...sub]);
    if (E2.length !== E0.length) continue;
    const X2 = E2.slice();
    for (let i = 0; i < 16 && i < X2.length; i++) X2[i] ^= bk.keys2[i];
    const re2 = encryptMode1([...X2], arr, 0);
    if (re2.length === target.length && re2.every((v, i) => v === target[i])) {
      console.log('★★★ 截断 ' + cut + ' 后完整匹配! basearr=' + sub.length + 'B');
      fs.writeFileSync(path.join(OUT, 'basearr_browser_final.json'), JSON.stringify({ cut, basearr: sub }));
    }
  }
  // 保存 basearr 供分析
  fs.writeFileSync(path.join(OUT, 'basearr_browser_plain.json'), JSON.stringify({ basearr: ba }));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
