/**
 * 625_enc25_full.js
 * 系统测试 encryptMode1/2 对多种明文/密钥 → 匹配 basearr[25-28]
 * 明文候选：keys22 decrypt 后各段、keys19/21 的 4B 编码、时间戳、keys2 前 16 等
 * 密钥候选：keys16/keys17/keys2/keys[0]/keys[1]/keys22 decrypt 前 16 等
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const gv = require(path.join(__dirname, '..', 'src/handler/globalVarible'));
const NX_CD = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
gv.cache = gv.cache || {};
gv.cache.config = { adapt: { cdBasestr: NX_CD } };
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const { encryptMode2, encryptMode1 } = require(path.join(__dirname, '..', 'src/handler/parser/common/modeEncrypt'));
const numarrAddTime = require(path.join(__dirname, '..', 'src/handler/parser/common/numarrAddTime'));
const decrypt = require(path.join(__dirname, '..', 'src/handler/parser/common/decrypt'));
const { ascii2string, numToNumarr4 } = require(path.join(__dirname, '..', 'src/handler/parser'));

const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));

for (let i = 0; i < 2; i++) {
  const b = d[i].basearr;
  const k = d[i].keys;
  const target25 = b.slice(25, 29);
  const target25BE = target25.reduce((a, x) => a * 256 + x, 0);
  console.log(`\n=== S${i + 1} [25-28]: ${target25.map(x => x.toString(16).padStart(2, '0')).join(' ')} BE=${target25BE} ===`);

  const dec22 = decrypt(ascii2string(k[22]));
  const k19n = +ascii2string(k[19]);
  const k21n = +ascii2string(k[21]);

  // 明文候选（16B 或 8B）
  const plains = {};
  plains['dec22前16'] = dec22.slice(0, 16);
  plains['dec22后16'] = dec22.slice(16, 32);
  plains['dec22全32'] = dec22.slice(0, 32);
  plains['k19n(4B)'] = numToNumarr4(k19n);
  plains['k21n(4B)'] = numToNumarr4(k21n);
  plains['k19+k21'] = [...numToNumarr4(k19n), ...numToNumarr4(k21n)];
  plains['k21+k19'] = [...numToNumarr4(k21n), ...numToNumarr4(k19n)];
  plains['k19x4'] = [...numToNumarr4(k19n), ...numToNumarr4(k19n), ...numToNumarr4(k19n), ...numToNumarr4(k19n)];
  plains['k21x4'] = [...numToNumarr4(k21n), ...numToNumarr4(k21n), ...numToNumarr4(k21n), ...numToNumarr4(k21n)];
  // keys2 相关
  plains['k2前16'] = k[2].slice(0, 16);
  plains['k2后16'] = k[2].slice(16, 32);
  plains['k2全48'] = k[2].slice(0, 48);
  // 时间戳
  plains['now(4B)'] = numToNumarr4(Math.floor(Date.now() / 1000));
  plains['nowx4'] = [...numToNumarr4(Math.floor(Date.now() / 1000)), ...numToNumarr4(Math.floor(Date.now() / 1000)), ...numToNumarr4(Math.floor(Date.now() / 1000)), ...numToNumarr4(Math.floor(Date.now() / 1000))];
  // 组合
  plains['dec22^k2前16'] = dec22.slice(0, 16).map((v, j) => v ^ k[2][j]);

  // 密钥候选
  const keysCands = {};
  for (let ki = 0; ki < k.length; ki++) {
    if (!k[ki]) continue;
    if (k[ki].length === 16) keysCands[`k[${ki}]`] = [...k[ki]];
    if (k[ki].length >= 16) keysCands[`k[${ki}]前16`] = k[ki].slice(0, 16);
  }
  keysCands['dec22前16'] = dec22.slice(0, 16);
  keysCands['dec22后16'] = dec22.slice(16, 32);
  keysCands['k2前16'] = k[2].slice(0, 16);
  keysCands['k2后16'] = k[2].slice(16, 32);
  keysCands['k17前16'] = k[17].slice(0, 16);

  let best = null;
  for (const [pn, plain] of Object.entries(plains)) {
    for (const [kn, key] of Object.entries(keysCands)) {
      for (const mode of [0, 1]) {
        for (const doTime of [false, true]) {
          const kk = doTime ? numarrAddTime([...key], 0, 1 / 256)[0] : key;
          try {
            // encryptMode1 输出是 numToNumarr4(ans)，对 4B 明文可能输出 16B
            // encryptMode2 输出截断 padding
            const out1 = encryptMode1([...plain], kk, mode);
            const out2 = encryptMode2([...plain], kk, mode);
            for (const [on, out] of [['m1', out1], ['m2', out2]]) {
              if (!out || out.length < 4) continue;
              // 匹配 [25-28]（任意位置）
              for (let s = 0; s + 4 <= out.length; s++) {
                const slice = out.slice(s, s + 4);
                if (slice[0] === target25[0] && slice[1] === target25[1]) {
                  console.log(`  ★ ${pn} + ${kn} + ${on} mode=${mode} time=${doTime} out[${s}]=${slice.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
                  if (!best) best = { pn, kn, on, mode, doTime, s, slice };
                }
              }
              // 逆序匹配
              const rev = [...plain].reverse();
              const outr = on === 'm1' ? encryptMode1(rev, kk, mode) : encryptMode2(rev, kk, mode);
              if (outr && outr.length >= 4) {
                for (let s = 0; s + 4 <= outr.length; s++) {
                  const slice = outr.slice(s, s + 4);
                  if (slice[0] === target25[0] && slice[1] === target25[1]) {
                    console.log(`  ★ rev ${pn} + ${kn} + ${on} mode=${mode} out[${s}]=${slice.map(x => x.toString(16).padStart(2, '0')).join(' ')}`);
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
    }
  }
  if (best) console.log('  ★★ 最佳:', JSON.stringify(best));
  else console.log('  无 ≥2 字节匹配');
}
process.exit(0);
