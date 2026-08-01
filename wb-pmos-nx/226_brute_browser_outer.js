/**
 * 226_brute_browser_outer.js
 *
 * 暴力浏览器 cookie 外层密钥：所有纯算法 keys + jsdom k17 候选
 * 校验：uuid(nextarr) == 前4B
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function decodeWith(str) {
  const idxmap = {}; for (let i = 0; i < B64.length; i++) idxmap[B64[i]] = i;
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
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  require('@src/handler/parser/constData').init();
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
  const parser = require('@src/handler/parser');

  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const pCookie = sync.cookies.find(c => c.name.endsWith('P')).value;
  console.log('P cookie:', pCookie.length, '前 22:', pCookie.substring(0, 22));

  // 各种前缀
  const variants = { a: pCookie.slice(1), none: pCookie, a2: pCookie.slice(2), '0': pCookie.startsWith('0') ? pCookie.slice(1) : pCookie };
  for (const [vname, payload] of Object.entries(variants)) {
    const C = decodeWith(payload);
    if (!C || C.length % 4 !== 0) { console.log(vname, '解码 ' + (C ? C.length : 'fail')); continue; }

    // 密钥候选
    const kCands = [];
    const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
    kCands.push(['K16', K16]);
    // 纯算法 keys
    const der = JSON.parse(fs.readFileSync(path.join(OUT, 'nx_keys_derived.json')));
    der.keys.forEach((k, i) => { if (Array.isArray(k) && k.length >= 16 && k.length <= 64) kCands.push(['keys' + i, k.slice(0, 16)]); });
    // jsdom k17 候选
    const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
    const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
    const all = trap.all || [];
    const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
    dedup.filter(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12)
      .forEach((a, i) => kCands.push(['jsd' + i, a]));

    console.log('\n=== 前缀 ' + vname + ' 密文 ' + C.length + 'B 密钥候选 ' + kCands.length + ' ===');
    for (const [kname, key] of kCands) {
      for (const flag of [1, 0]) {
        try {
          const arr = numarrAddTime([...key], 0, 1 / 256)[0];
          const dec = encryptMode2([...C], arr, flag);
          if (dec.length < 50) continue;
          const nextarr = dec.slice(4);
          const u4 = parser.numToNumarr4(parser.uuid(nextarr));
          if (u4.every((v, i) => v === dec[i])) {
            console.log('★★★ ' + kname, 'flag=' + flag, 'dec=' + dec.length + 'B uuid=YES');
            console.log('  nextarr[0]:', nextarr[0], '前 16:', nextarr.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
            fs.writeFileSync(path.join(OUT, 'browser_outer_ok.json'), JSON.stringify({ kname, flag, dec, C }));
            process.exit(0);
          }
        } catch (e) {}
      }
    }
    console.log('  无 uuid 命中');
  }
  process.exit(1);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
