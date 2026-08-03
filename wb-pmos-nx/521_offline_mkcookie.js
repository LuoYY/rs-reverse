/**
 * 521_offline_mkcookie.js
 * 离线调试：用保存的 naA 跑 mkCookie，复现 343 vs 345 差异
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64).split('');
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarr2string = require('@src/handler/parser/common/numarr2string');
const numToNumarr4 = require('@src/handler/parser/common/numToNumarr4');
const uuidFn = require('@src/handler/parser/common/uuid');
const keys16arr = numarrAddTime([...K16], 0, 1 / 256)[0];

const na = JSON.parse(fs.readFileSync('/tmp/naA.json', 'utf8'));
const u4 = numToNumarr4(uuidFn(na));
console.log('uuid:', u4.map(b => b.toString(16).padStart(2, '0')).join(' '));
const final = encryptMode1([...u4, ...na], keys16arr, 1);
console.log('final len:', final.length, 'NaN:', final.filter(v => Number.isNaN(v)).length, '>255:', final.filter(v => v > 255).length);
const str = numarr2string(final, B86_64);
console.log('str len:', str.length, 'cookie len:', ('a' + str).length);

// 对比：浏览器原样 cookie（/tmp/pA.txt）
const orig = fs.readFileSync('/tmp/pA.txt', 'utf8').trim();
console.log('浏览器原样 cookie len:', orig.length);
console.log('重构 == 原样:', ('a' + str) === orig);

// 检查 keys 数组完整性
console.log('B86_64 长度:', B86_64.length, '唯一:', new Set(B86_64).size);
