/**
 * 271_compare_env_keys.js
 *
 * 对比 jsdom vs 浏览器 vs 纯算法的 keys2/16/17
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'captures');

(async () => {
  // 浏览器 keys（browserKeys + nextarr keys2）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const bk = sync.browserKeys;
  const nf = fs.readdirSync(OUT).filter(x => x.startsWith('browser_nextarr_')).sort().pop();
  const nd = JSON.parse(fs.readFileSync(path.join(OUT, nf)));
  const nextarr = nd.nextarr;
  const browserK2 = nextarr.slice(11, 59);
  console.log('=== 浏览器 ===');
  console.log('browserKeys.keys2:', JSON.stringify(bk.keys2).substring(0, 100));
  console.log('nextarr keys2:    ', JSON.stringify(browserK2).substring(0, 100));
  console.log('browserKeys.keys16:', JSON.stringify(bk.keys16));
  console.log('browserKeys.keys17:', JSON.stringify(bk.keys17));

  // jsdom keys（大[225]）
  const trapFile = fs.readdirSync(OUT).filter(f => f.startsWith('trap_all_')).sort().pop();
  const trap = JSON.parse(fs.readFileSync(path.join(OUT, trapFile)));
  const all = trap.all || [];
  const dedup = [...new Map(all.map(a => [a.length + ':' + a.join(','), a])).values()];
  const plain = dedup.find(a => a.length === 225 && a.filter(v => v >= 32 && v <= 126).length < 100);
  const jsdomNextarr = plain.slice(4);
  const jsdomK2 = jsdomNextarr.slice(11, 59);
  console.log('\n=== jsdom ===');
  console.log('jsdom nextarr keys2:', JSON.stringify(jsdomK2).substring(0, 100));
  const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];
  const jsdomK16 = dedup.find(a => a.length === 16 && a.every((v, i) => v === K16[i]));
  console.log('jsdom keys16:', JSON.stringify(jsdomK16));
  const jsdomK17 = dedup.find(a => a.length === 16 && !a.every((v, i) => v === K16[i]) && a.filter(b => b >= 32 && b <= 126).length < 12);
  console.log('jsdom keys17(第一个):', JSON.stringify(jsdomK17));

  // 纯算法 keys
  const kf = fs.readdirSync(OUT).filter(f => f.startsWith('keys_fixed_')).sort().pop();
  const keysData = JSON.parse(fs.readFileSync(path.join(OUT, kf)));
  console.log('\n=== 纯算法 ===');
  console.log('pure keys2:', JSON.stringify(keysData.keys[2]).substring(0, 100));
  console.log('pure keys16:', JSON.stringify(keysData.keys[16]));
  console.log('pure keys17:', JSON.stringify(keysData.keys[17]));

  // 对比
  console.log('\n=== 对比 ===');
  console.log('jsdomK2 == browserK2:', jsdomK2.every((v, i) => v === browserK2[i]) ? 'YES' : 'NO');
  console.log('pureK2 == browserK2:', keysData.keys[2].every((v, i) => v === browserK2[i]) ? 'YES' : 'NO');
  console.log('jsdomK2 == pureK2:', jsdomK2.every((v, i) => v === keysData.keys[2][i]) ? 'YES' : 'NO');
  console.log('jsdomK16 == browserK16:', JSON.stringify(jsdomK16) === JSON.stringify(bk.keys16) ? 'YES' : 'NO');
  console.log('jsdomK17 == browserK17:', JSON.stringify(jsdomK17) === JSON.stringify(bk.keys17) ? 'YES' : 'NO');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
