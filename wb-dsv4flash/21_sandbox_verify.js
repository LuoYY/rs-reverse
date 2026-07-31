/**
 * 21_sandbox_verify.js
 *
 * 决定性测试：沙箱运行真实 cd → 生成的 P cookie 解密 → keys 是否与浏览器一致
 * 如果一致 → 沙箱可复现浏览器会话（含 keys2/keys17/计数器/前缀）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

require('module-alias')(ROOT);
const { runSandbox } = require(path.join(ROOT, 'output/keygen/sandbox_keygen.js'));

const BASESTR = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^";

function decodeBase(str) {
  const idxmap = {};
  for (let i = 0; i < BASESTR.length; i++) idxmap[BASESTR[i]] = i;
  const payload = str.startsWith('0') ? str.slice(1) : str;
  const bytes = [];
  let qi = 0;
  const groups = Math.floor(payload.length / 4);
  for (let g = 0; g < groups; g++) {
    const c0 = idxmap[payload[qi]], c1 = idxmap[payload[qi + 1]], c2 = idxmap[payload[qi + 2]], c3 = idxmap[payload[qi + 3]];
    qi += 4;
    bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
  }
  if (qi + 1 < payload.length) bytes.push((idxmap[payload[qi]] << 2) | (idxmap[payload[qi + 1]] >> 4));
  return bytes;
}

async function main() {
  // 用浏览器会话（含 keys30 + cd + cookies）
  const capFile = 'everything_1785489159074.json';
  const d = JSON.parse(fs.readFileSync(path.join(OUT, capFile), 'utf8'));
  const { nsd, cd } = d.challenges[d.challenges.length - 1];
  const browserKeys2 = d.keys30[2].d;
  const browserKeys17 = d.keys30[17].d;
  const browserKeys16 = d.keys30[16].d;
  const oCookie = d.cookies.find(c => c.name.endsWith('O')).value;

  console.log('=== 沙箱验证 ===');
  console.log('nsd=' + nsd + ' cdLen=' + cd.length);
  console.log('浏览器 keys2:', browserKeys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('浏览器 keys17:', browserKeys17.map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 跑沙箱
  const outerJs = fs.readFileSync(path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js'), 'utf8');
  console.log('\n[1] 沙箱执行外层 VM + 动态代码...');
  const sand = runSandbox({ nsd, cd }, { outerJsCode: outerJs, seedCookie: oCookie + '; __sandbox=1', timeout: 180000 });
  console.log('  pCookie:', sand.pCookie ? sand.pCookie.substring(0, 40) + '... len=' + sand.pCookie.length : 'NULL');
  console.log('  cookies:', sand.cookies.length, '条');
  console.log('  errors:', sand.errors.slice(0, 5));
  console.log('  missing:', sand.missing.slice(0, 10));

  if (!sand.pCookie) { console.log('  ❌ 无 cookie'); process.exit(1); }

  // 解密沙箱 cookie
  const pValue = sand.pCookie.split('=')[1];
  const pBytes = decodeBase(pValue);
  console.log('\n[2] 沙箱 P cookie 解码:', pBytes.length, 'B');
  console.log('  前32字节:', pBytes.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));

  // 用 keys16 解密（flag=1，带 IV）
  const { encryptMode2 } = require('@src/handler/parser/common/modeEncrypt');
  require('@src/handler/parser/constData').init();
  try {
    const nextarr = encryptMode2(pBytes, browserKeys16, 1);
    console.log('\n[3] keys16 解密 → nextarr:', nextarr.length, 'B');
    console.log('  nextarr前32:', nextarr.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('  头部: [', nextarr.slice(0, 8).join(', '), ']');
    // nextarr 结构: [2][time4][48][keys2 48B][244][basearrEncrypt 244B]...
    if (nextarr[0] === 2) {
      const sbKeys2 = nextarr.slice(7, 55);
      console.log('\n[4] 沙箱 keys2:', sbKeys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      console.log('    浏览器 keys2:', browserKeys2.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
      const match = sbKeys2.length === browserKeys2.length && sbKeys2.every((b, i) => b === browserKeys2[i]);
      console.log('    ★★★ keys2 一致:', match ? 'YES!' : 'NO');
      if (!match) {
        // XOR 差异
        console.log('    差异:', sbKeys2.slice(0, 16).map((b, i) => (b ^ browserKeys2[i]).toString(16).padStart(2, '0')).join(' '));
      }
      // 后面是 basearrEncrypt
      if (nextarr[55] === 244 || nextarr.length > 60) {
        const basearrEnc = nextarr.slice(56, 300);
        console.log('\n[5] basearrEncrypt:', basearrEnc.length, 'B');
        console.log('  前16:', basearrEnc.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' '));
        fs.writeFileSync(path.join(OUT, 'sandbox_basearr_' + Date.now() + '.json'), JSON.stringify({ basearrEnc: basearrEnc.slice(0, 244) }));
      }
    }
  } catch (e) {
    console.log('  解密失败:', e.message.substring(0, 80));
  }

  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
