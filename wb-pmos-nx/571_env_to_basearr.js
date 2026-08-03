/**
 * 571_env_to_basearr.js
 * 浏览器环境值（533 号 env_browser.json）→ nx basearr 稳定段 [0-23]
 * 验证 xb len243.js [1] 段公式是否适用于 nx 稳定段：
 *   maxTouchPoints, evalLen, 128, uuid(UA), platform, execNumberByTime, execRandomByNumber...
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const parser = require(path.join(__dirname, '..', 'src/handler/parser'));
const { uuid, string2ascii, numToNumarr4, execRandomByNumber, numToNumarr2, numToNumarr8 } = parser;

const env = JSON.parse(fs.readFileSync('/tmp/env_browser.json', 'utf8'));
const d = JSON.parse(fs.readFileSync('/tmp/full_keys_dataset.json', 'utf8'));
const browserBase = d[0].basearr;

console.log('浏览器 basearr[0-23]:', browserBase.slice(0, 24).map(x => x.toString(16).padStart(2, '0')).join(' '));

// xb len243.js [1] 段（[3] 段的子段）:
// numarrJoin(1, maxTouchPoints, evalLen, 128, uuid4, platform_ascii, execNumberByTime4, execRandomByNumber(98), 0, 0, hexnum4, 0, innerH2, innerW2, outerH2, outerW2, 0x8)
const maxTouchPoints = env.maxTouchPoints || 0;
const evalLen = env.evalLen || 33;
const ua = env.ua;
const platform = env.platform;
const execNumberByTime = 0x2A2A; // 未知，先 0
const random = Math.random;

const seg = [
  maxTouchPoints, evalLen, 128,
  ...numToNumarr4(uuid(ua)),
  ...string2ascii(platform),
  ...numToNumarr4(execNumberByTime),
  ...execRandomByNumber(98, random),
  0, 0,
  ...numToNumarr4(0x3136373737323136 >>> 0), // 时间常量
  0, 0, 0, 0,
  ...numToNumarr2(env.innerH || 0), ...numToNumarr2(env.innerW || 0),
  ...numToNumarr2(env.outerH || 0), ...numToNumarr2(env.outerW || 0),
  ...numToNumarr8(0),
];
console.log('\n环境段生成 (len=' + seg.length + '):');
console.log(seg.map(x => x.toString(16).padStart(2, '0')).join(' '));
console.log('前 24:', seg.slice(0, 24).map(x => x.toString(16).padStart(2, '0')).join(' '));

// 与浏览器 basearr 对比
console.log('\n=== 对比 ===');
for (let i = 0; i < Math.min(seg.length, browserBase.length); i++) {
  if (seg[i] !== browserBase[i]) {
    console.log(`首个差异 @${i}: 生成=${seg[i].toString(16)} 浏览器=${browserBase[i].toString(16)}`);
    console.log('生成上下文:', seg.slice(Math.max(0, i - 5), i + 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
    console.log('浏览上下文:', browserBase.slice(Math.max(0, i - 5), i + 8).map(x => x.toString(16).padStart(2, '0')).join(' '));
    break;
  }
}

// 逐个验证字段
console.log('\n=== 字段验证 ===');
console.log('maxTouchPoints:', maxTouchPoints, 'vs 浏览器[0]=', browserBase[0]);
console.log('evalLen:', evalLen, 'vs 浏览器[1]=', browserBase[1]);
console.log('128 vs 浏览器[2]=', browserBase[2]);
console.log('uuid(UA):', uuid(ua).toString(16), 'vs 浏览器[3-6]=', browserBase.slice(3, 7).map(x => x.toString(16)).join(''));
