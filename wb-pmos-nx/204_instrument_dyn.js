/**
 * 204_instrument_dyn.js
 *
 * 修改 dynCode 的 main dispatcher：while 循环插桩打印操作码
 * jsdom 执行 → 追踪操作码流 → 找 basestr 构建（op62 创建数组 + op38/op1 push 常量）
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'captures');
const TARGET = 'https://pmos.nx.sgcc.com.cn:10443/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.nx.sgcc.com.cn/c9qYRt1w5yKr/83bw0aTvAW7K.2437991.js');

(async () => {
  const sync = JSON.parse(fs.readFileSync(path.join(OUT, 'sync_1785512612887.json')));
  const { nsd, cd } = sync.challenge;

  // 读 dynCode 并插桩 main dispatcher（_$o1）
  const dyn = fs.readFileSync('/tmp/nx_dyn_full.js', 'utf8');
  // 找 _$o1 函数
  const o1Idx = dyn.indexOf('function _$o1(');
  console.log('_$o1 @', o1Idx);
  // 找 _$o1 的 while 循环（函数体内）
  const o1BodyStart = dyn.indexOf('{', o1Idx);
  const o1Body = dyn.substring(o1BodyStart, o1BodyStart + 15052);
  const wIdx = o1Body.indexOf('while(1)');
  console.log('while @', o1BodyStart + wIdx, ':', JSON.stringify(o1Body.substring(wIdx, wIdx + 80)));

  // 修改 dynCode：在 _$o1 的 while(1) 后插入操作码日志（全局开关）
  const whilePat = 'while(1){';
  // 需要找到 _$o1 内的 while(1)
  const absW = o1BodyStart + wIdx;
  // 在 while(1){ 后插入插桩
  // 但需要操作码变量名——从 while 开头找（_$x=_$y[_$z++]）
  const wOpen = dyn.substring(absW, absW + 120);
  console.log('while 开头:', JSON.stringify(wOpen));
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
