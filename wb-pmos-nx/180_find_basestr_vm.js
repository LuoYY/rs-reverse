/**
 * 180_find_basestr_vm.js
 *
 * 搜索 dynCode 里 basestr(64) 的字符代码序列（0-9A-Z_a-z = 45,48-57,65-90,95,97-122）
 * 瑞数常量池可能在操作码数据或数组构建里
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGET_CHARS = new Set([45, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 95, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122]);

(async () => {
  const sync = JSON.parse(fs.readFileSync(path.join(ROOT, 'wb-pmos-nx/captures/sync_1785512612887.json')));
  const { runOuterVM } = require(path.join(ROOT, 'extract_dyncode_20080.js'));
  const outer = fs.readFileSync(path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js'), 'utf8');
  const r = runOuterVM({ nsd: sync.challenge.nsd, cd: sync.challenge.cd }, outer);
  const dyn = r.dynCode;
  console.log('dynCode len:', dyn.length);

  // 1. 搜索数字数组：45,48,49... 等 64 个目标字符代码的连续序列（数组字面量）
  // 2. 搜索字符串 "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz" 或其子串
  const searches = [
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    '_-0123456789',
    '0123456789-_',
    'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj',
  ];
  for (const s of searches) {
    const idx = dyn.indexOf(s);
    console.log(`搜索 "${s.substring(0, 30)}...":`, idx >= 0 ? `@${idx}` : '未找到');
  }

  // 3. 搜索连续字符代码（操作码数据可能是 _xxx([45,48,...]) 形式）
  // 用正则找长数字序列（含目标字符代码）
  const re = /\[(\d{1,3},){55,}?\d{1,3}\]/g;
  let m, count = 0;
  const cands = [];
  while ((m = re.exec(dyn)) !== null && count < 300) {
    const arr = m[0].slice(1, -1).split(',').map(s => parseInt(s.trim(), 10));
    if (arr.length >= 60 && arr.length <= 70) {
      // 统计目标字符代码
      const inTarget = arr.filter(v => TARGET_CHARS.has(v)).length;
      if (inTarget > arr.length * 0.6) {
        const str = arr.map(v => TARGET_CHARS.has(v) ? String.fromCharCode(v) : '?').join('');
        cands.push({ pos: m.index, arr, str, inTarget });
      }
    }
    count++;
  }
  console.log('\n数组候选:', cands.length, '（扫描', count, '个数组）');
  cands.slice(0, 10).forEach(c => console.log('  @' + c.pos, 'len=' + c.arr.length, '匹配=' + c.inTarget, JSON.stringify(c.str)));

  // 4. 搜索字符代码的另一种形式：使用 String.fromCharCode 的调用
  const fc = dyn.match(/String\.fromCharCode\s*\(([^)]+)\)/g);
  console.log('\nfromCharCode 调用:', fc ? fc.length : 0, fc ? fc.slice(0, 5) : '');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
