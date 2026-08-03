/**
 * 581_env_encoding.js
 * 系统测试 nx basearr[0-23] 稳定段 = 浏览器环境值的编码
 * 候选：uuid(UA)、numToNumarr4(hash)、string2ascii(platform)、时间常量
 */
const fs = require('fs');
const path = require('path');
try { require('module-alias')(path.dirname(require(path.join(__dirname, '..', 'utils/paths.js')).package)); } catch (e) {}
require(path.join(__dirname, '..', 'src/handler/parser/constData')).init();
const parser = require(path.join(__dirname, '..', 'src/handler/parser'));

const { uuid, string2ascii, numToNumarr2, numToNumarr4, numToNumarr8 } = parser;

const env = JSON.parse(fs.readFileSync('/tmp/env_browser.json', 'utf8'));
const B = [0x64, 0x00, 0x00, 0x24, 0x42, 0x7a, 0x95, 0x00, 0xad, 0xcf, 0xd9, 0xe0, 0x00, 0xbd, 0x2b, 0x7e, 0x2e, 0xc9, 0x9f, 0xd5, 0xcd, 0x78, 0x06, 0x00];
console.log('basearr[0-23]:', B.map(x => x.toString(16).padStart(2, '0')).join(' '));

// 候选编码
console.log('\n=== uuid(UA) ===');
const u = uuid(env.ua);
console.log('uuid(UA):', u, '→ 4B:', (u >>> 24 & 255).toString(16), (u >>> 16 & 255).toString(16), (u >>> 8 & 255).toString(16), (u & 255).toString(16));
console.log('basearr[3-6]:', B.slice(3, 7).map(x => x.toString(16)).join(' '));

// uuid 用不同 base
for (const base of [16, 36, 62, 64, 128, 256]) {
  const v = uuid(env.ua, base);
  const bytes = numToNumarr4(v);
  console.log(`uuid(UA, base=${base}):`, v, 'bytes:', bytes.map(x => x.toString(16)).join(' '), 'vs B[3-6]:', B.slice(3, 7).map(x => x.toString(16)).join(' '));
}

// hash 候选
function crc32(data) {
  let c = ~0;
  for (const d of data) {
    c ^= d;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function md5Simple(s) { // 用 Node crypto
  return require('crypto').createHash('md5').update(s).digest();
}
function sha1Simple(s) {
  return require('crypto').createHash('sha1').update(s).digest();
}

const tests = {
  'crc32(UA)': crc32([...env.ua].map(c => c.charCodeAt())),
  'crc32(platform)': crc32([...env.platform].map(c => c.charCodeAt())),
  'crc32(UA+platform)': crc32([...env.ua + env.platform].map(c => c.charCodeAt())),
  'md5(UA)[0-3]': md5Simple(env.ua)[0] << 24 | md5Simple(env.ua)[1] << 16 | md5Simple(env.ua)[2] << 8 | md5Simple(env.ua)[3],
  'sha1(UA)[0-3]': sha1Simple(env.ua)[0] << 24 | sha1Simple(env.ua)[1] << 16 | sha1Simple(env.ua)[2] << 8 | sha1Simple(env.ua)[3],
  'crc32(screen)': crc32([...`${env.screenW}x${env.screenH}`].map(c => c.charCodeAt())),
  'crc32(inner)': crc32([...`${env.innerW}x${env.innerH}`].map(c => c.charCodeAt())),
};

console.log('\n=== hash 候选 → B[3-6] (42 7a 95 00) ===');
const target = 0x427a9500;
for (const [name, v] of Object.entries(tests)) {
  const bytes = numToNumarr4(v);
  console.log(`${name}: ${v.toString(16)} → [${bytes.map(x => x.toString(16)).join(' ')}] ${bytes[0] === B[3] && bytes[1] === B[4] ? '★MATCH' : ''}`);
  if (bytes[0] === B[3] && bytes[1] === B[4]) console.log('  首2字节匹配!');
}

// B[0]=64=100、B[1]=0、B[2]=0、B[3]=24=36
console.log('\n=== 数值字段 ===');
console.log('B[0]=0x64=100, B[3]=0x24=36');
console.log('hardwareConcurrency:', env.hardwareConcurrency);
console.log('screenW:', env.screenW, 'screenH:', env.screenH);
console.log('colorDepth:', env.colorDepth);
console.log('canvasHash:', env.canvasHash, 'hex:', env.canvasHash.toString(16));
console.log('basearr[?] 含 24/36/100?', B.indexOf(24), B.indexOf(36), B.indexOf(100));

// B[6]=0x95=149, B[12]=0, B[13]=0xbd=189
// B[7]=0, B[8]=0xad=173, B[9]=0xcf=207, B[10]=0xd9=217, B[11]=0xe0=224
console.log('\ncanvasHash 大端4B:', numToNumarr4(env.canvasHash).map(x => x.toString(16)).join(' '));
console.log('basearr[4-7]:', B.slice(4, 8).map(x => x.toString(16)).join(' '));
console.log('basearr[6-9]:', B.slice(6, 10).map(x => x.toString(16)).join(' '));
console.log('basearr[8-11]:', B.slice(8, 12).map(x => x.toString(16)).join(' '));

// 时间戳常量 hexnum
console.log('\n=== 时间常量 ===');
console.log('"3136373737323136" hex:', parseInt('3136373737323136', 16), '→ 4B:', numToNumarr4(parseInt('3136373737323136', 16)).map(x => x.toString(16)).join(' '));
console.log('basearr[13-16]:', B.slice(13, 17).map(x => x.toString(16)).join(' '));
