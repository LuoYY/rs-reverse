/**
 * 317_test_genquery.js
 * 单独测试 genQuery 输出：长度/字符集/与管线 numarr2string 对比
 */
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';
const path = require('path');
const ROOT = path.join(__dirname, '..');

const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
const B86_64 = NX_BS.slice(0, 64);
const K16 = [215, 90, 92, 114, 190, 161, 210, 59, 55, 192, 204, 2, 209, 95, 17, 173];

for (const k of Object.keys(require.cache)) delete require.cache[k];
require('module-alias')(path.dirname(require(path.join(ROOT, 'utils/paths.js')).package));
require('@src/handler/parser/constData').init();
const { encryptMode1 } = require('@src/handler/parser/common/modeEncrypt');
const numarrAddTime = require('@src/handler/parser/common/numarrAddTime');
const numarr2string = require('@src/handler/parser/common/numarr2string');

const browserK2 = [2, 217, 131, 98, 7, 217, 190, 58, 194, 220, 139, 196, 248, 124, 232, 115, 187, 5, 29, 251, 124, 249, 178, 184, 105, 155, 107, 214, 164, 113, 241, 117, 231, 225, 246, 68, 172, 144, 253, 117, 60, 191, 87, 99, 45, 222, 122, 29];
const pureK17 = [...new Array(16)].map(() => Math.floor(Math.random() * 256));

const randByte = () => Math.floor(Math.random() * 256);
const PREFIX_MASK = [0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01];
const urlPath = '/px-common-authcenter/auth/v2/captcha/get';

function crc32b(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }

function genQuery(urlPath) {
  const cu = crc32b(Buffer.from(urlPath.toUpperCase()));
  const plain24 = [
    browserK2[0] ^ PREFIX_MASK[0], browserK2[1] ^ PREFIX_MASK[1], browserK2[2], browserK2[3] ^ PREFIX_MASK[3],
    browserK2[4], browserK2[5] ^ PREFIX_MASK[5], browserK2[6], browserK2[7] ^ PREFIX_MASK[7],
    randByte(), randByte(), randByte(), randByte(), randByte(),
    randByte(), randByte(), randByte(), 0xb7, randByte(), randByte(), randByte(),
    (cu >>> 24) & 255, (cu >>> 16) & 255, (cu >>> 8) & 255, cu & 255,
  ];
  const [key21] = numarrAddTime([...pureK17], Math.floor(Date.now() / 1000), Math.random());
  const requestData = encryptMode1(plain24, key21, 0);
  const body = [4, 0, 48, ...browserK2, 32, ...requestData];
  const crc = crc32b(Buffer.from(body));
  return 'a' + numarr2string([(crc >>> 24) & 255, (crc >>> 16) & 255, (crc >>> 8) & 255, crc & 255, ...body], B86_64.split(''));
}

const q = genQuery(urlPath);
console.log('query 长度:', q.length);
console.log('query:', q);
console.log('含特殊字符:', /[^A-Za-z0-9_-]/.test(q) ? '有 → ' + q.match(/[^A-Za-z0-9_-]/g) : '无');

// 浏览器真实 query 长度对比
console.log('\n浏览器真实 URL query 长度: 119 (应一致)');

// 再测：直接把浏览器真实字节流编码
const bytes = [29, 31, 47, 24, 4, 0, 48, ...browserK2, 32];
// 手动补完整测试：numarr2string 对 88 字节
const full88 = [...bytes];
while (full88.length < 88) full88.push(Math.floor(Math.random() * 256));
const enc = numarr2string(full88, B86_64.split(''));
console.log('\nnumarr2string(88B, B86_64) 长度:', enc.length);
console.log('含特殊字符:', /[^A-Za-z0-9_-]/.test(enc) ? '有 → ' + enc.match(/[^A-Za-z0-9_-]/g) : '无');
