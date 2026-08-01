/**
 * 100_derive_offset.js
 *
 * 反推 nx 的 offset（cd 解密偏移数组）：
 *   ans = cdArr[end:] ^ offset[i%8]
 *   keys = genKeys(ans)  →  keys[17]（16B）已知（浏览器采集）
 * 迭代收敛 offset → 验证多会话是否一致（固定 = 纯算法硬编码）
 *
 * 用法：node 100_derive_offset.js
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');

(async () => {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
  gv_utils_init();
  require('@src/handler/parser/constData').init();
  const decrypt = require('@src/handler/parser/common/decrypt');

  // 模拟 genKeys step=2（含 step=1 递归的 fallback）
  function genKeysSim(ans, step = 2, depth = 0) {
    if (step <= 0 || depth > 3) return null;
    const keys = [];
    try {
      for (let i = 0, op = 1, gap; i < ans[0]; i++) {
        if (step === 2) { [gap, op] = [ans[op] << 8 | ans[op + 1], op + 2]; }
        else if (step === 1) {
          // getLens 近似：从 ans 读取 len 结构（简化：len 字节）
          gap = ans[op]; op += 1;
        }
        keys.push(ans.slice(op, op + gap));
        op += gap;
      }
      if ([29, 30, 31, 32].some(k => !keys[k] || keys[k].length !== 4)) return genKeysSim(ans, step - 1, depth + 1);
      return keys;
    } catch (e) { return null; }
  }

  function deriveOffsetFor(cd, keys17, keys2) {
    const cdArr = decrypt(cd);
    const end = (cdArr[0] << 8 | cdArr[1]) + 2;
    const tail = cdArr.slice(end);
    let offset = new Array(8).fill(0);
    let lastKey17 = null;
    for (let iter = 0; iter < 30; iter++) {
      const ans = tail.map((b, i) => b ^ offset[i % 8]);
      const keys = genKeysSim(ans);
      if (!keys) break;
      // 用 keys17 约束 offset
      if (keys[17] && keys[17].length === 16) {
        // 找 keys[17] 在 ans 中的位置：重新模拟 op 序列
        let op = 1, pos17 = -1;
        for (let i = 0; i < ans[0]; i++) {
          const gap = ans[op] << 8 | ans[op + 1];
          op += 2;
          if (i === 17) pos17 = op;
          op += gap;
        }
        if (pos17 > 0) {
          for (let i = 0; i < 16; i++) {
            offset[i % 8] = tail[pos17 + i] ^ keys17[i];
          }
        }
        lastKey17 = keys[17];
      }
    }
    return { offset, keys17: lastKey17 };
  }

  function gv_utils_init() {
    const gv = require('@src/handler/globalVarible');
    gv._setAttr('utils', require('@src/handler/parser/common'));
  }

  // 验证 1：sync 会话（keys17 已知）
  const syncFile = fs.readdirSync(OUT).filter(f => f.startsWith('sync_')).sort().pop();
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, syncFile)));
  const { nsd, cd } = sync.challenge;
  const r1 = deriveOffsetFor(cd, sync.browserKeys.keys17, sync.browserKeys.keys2);
  console.log('sync nsd:', nsd);
  console.log('推导 offset:', r1.offset.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('keys17 一致:', r1.keys17 && r1.keys17.every((v, i) => v === sync.browserKeys.keys17[i]) ? '★★★ YES' : 'NO');
  if (r1.keys17 && !r1.keys17.every((v, i) => v === sync.browserKeys.keys17[i])) {
    console.log('推导 keys17:', r1.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
    console.log('浏览器 keys17:', sync.browserKeys.keys17.map(b => b.toString(16).padStart(2, '0')).join(' '));
  }

  // 验证 2：multi_cd_keys 会话（keys2 已知，keys17 无）——用 keys2 推导 offset
  const multiFiles = fs.readdirSync(OUT).filter(f => f.startsWith('multi_cd_keys_'));
  for (const mf of multiFiles) {
    const sessions = JSON.parse(fs.readFileSync(path.join(OUT, mf)));
    for (const s of sessions) {
      if (!s.cd || !s.keys2) continue;
      const cdArr = decrypt(s.cd);
      const end = (cdArr[0] << 8 | cdArr[1]) + 2;
      const tail = cdArr.slice(end);
      // 用 keys2 推导 offset
      let offset = new Array(8).fill(0);
      for (let iter = 0; iter < 30; iter++) {
        const ans = tail.map((b, i) => b ^ offset[i % 8]);
        let op = 1, pos2 = -1;
        for (let i = 0; i < ans[0]; i++) {
          const gap = ans[op] << 8 | ans[op + 1];
          op += 2;
          if (i === 2) pos2 = op;
          op += gap;
        }
        if (pos2 > 0 && s.keys2.length === 48) {
          for (let i = 0; i < 48; i++) offset[i % 8] = tail[pos2 + i] ^ s.keys2[i];
        }
      }
      console.log(`multi 会话 nsd=${s.nsd} 推导 offset:`, offset.map(b => b.toString(16).padStart(2, '0')).join(' '));
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
