/**
 * query_diff_analysis.js — 差分分析 + 多算法尝试
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const fs = require('fs'), crypto = require('crypto');
const data = JSON.parse(fs.readFileSync('output/capture-20080/query-same-session-crack.json', 'utf8'));
const queries = data.queries;
const keys = data.keys;

const basestr = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^';
const idxmap = {};
basestr.split('').forEach((k, i) => { if (!(k in idxmap)) idxmap[k] = i; });

function decode(q) {
  const p = q.startsWith('0') ? q.slice(1) : q;
  const bytes = []; let i = 0;
  const full = Math.floor(p.length / 4);
  for (let g = 0; g < full; g++) {
    const c0=idxmap[p[i]],c1=idxmap[p[i+1]],c2=idxmap[p[i+2]],c3=idxmap[p[i+3]];
    i+=4; bytes.push((c0<<2)|(c1>>4),((c1&15)<<4)|(c2>>2),((c2&3)<<6)|c3);
  }
  const rem = p.length-i;
  if (rem===2) bytes.push((idxmap[p[i]]<<2)|(idxmap[p[i+1]]>>4));
  else if (rem===3) bytes.push((idxmap[p[i]]<<2)|(idxmap[p[i+1]]>>4),((idxmap[p[i+1]]&15)<<4)|(idxmap[p[i+2]]>>2));
  return bytes;
}

queries.forEach(q => { q.bytes=decode(q.query); q.nonce=q.bytes.slice(0,4); q.session=q.bytes.slice(7,55); q.request=q.bytes.slice(56,88); });

function aesDecrypt(data, key, iv, mode) {
  try {
    const dec = crypto.createDecipheriv('aes-'+(key.length*8)+'-'+mode, Buffer.from(key), iv||Buffer.alloc(0));
    dec.setAutoPadding(false);
    return Array.from(Buffer.concat([dec.update(Buffer.from(data)), dec.final()]));
  } catch(e) { return null; }
}
function asciiRatio(b) { if(!b) return 0; return b.filter(x=>x>=32&&x<=126).length/b.length; }

const session = queries[0].session;
const request = queries[0].request;
const nonce = queries[0].nonce;

console.log('=== 1. AES-ECB ===');
keys.forEach(ki => {
  if (ki.data.length < 16) return;
  const key = ki.data.slice(0, 16);
  ['session','request'].forEach((name, idx) => {
    const data = idx === 0 ? session : request;
    const dec = aesDecrypt(data, key, null, 'ecb');
    const r = asciiRatio(dec);
    if (r > 0.5) console.log(`  [${ki.idx}] ${name} ECB: ${(r*100).toFixed(0)}%`);
  });
});

console.log('\n=== 2. AES-CTR (nonce as counter) ===');
keys.forEach(ki => {
  if (ki.data.length < 16) return;
  const key = ki.data.slice(0, 16);
  // counter = nonce(4B) + zeros(12B)
  const counter = Buffer.alloc(16);
  Buffer.from(nonce).copy(counter);
  ['session','request'].forEach((name, idx) => {
    const data = idx === 0 ? session : request;
    const dec = aesDecrypt(data, key, counter, 'ctr');
    const r = asciiRatio(dec);
    if (r > 0.5) {
      console.log(`  [${ki.idx}] ${name} CTR: ${(r*100).toFixed(0)}%`);
      const text = dec.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
      if (text.length > 3) console.log(`    text: "${text.substring(0,50)}"`);
    }
  });
});

console.log('\n=== 3. AES-CFB ===');
keys.forEach(ki => {
  if (ki.data.length < 16) return;
  const key = ki.data.slice(0, 16);
  const iv = Buffer.alloc(16);
  Buffer.from(nonce).copy(iv);
  ['session','request'].forEach((name, idx) => {
    const data = idx === 0 ? session : request;
    const dec = aesDecrypt(data, key, iv, 'cfb');
    const r = asciiRatio(dec);
    if (r > 0.5) console.log(`  [${ki.idx}] ${name} CFB: ${(r*100).toFixed(0)}%`);
  });
});

console.log('\n=== 4. AES-OFB ===');
keys.forEach(ki => {
  if (ki.data.length < 16) return;
  const key = ki.data.slice(0, 16);
  const iv = Buffer.alloc(16);
  Buffer.from(nonce).copy(iv);
  ['session','request'].forEach((name, idx) => {
    const data = idx === 0 ? session : request;
    const dec = aesDecrypt(data, key, iv, 'ofb');
    const r = asciiRatio(dec);
    if (r > 0.5) console.log(`  [${ki.idx}] ${name} OFB: ${(r*100).toFixed(0)}%`);
  });
});

console.log('\n=== 5. RC4 ===');
keys.forEach(ki => {
  if (ki.data.length < 8) return;
  const key = ki.data;
  try {
    const dec = crypto.createDecipheriv('rc4', Buffer.from(key), '');
    const result = Array.from(Buffer.concat([dec.update(Buffer.from(session)), dec.final()]));
    const r = asciiRatio(result);
    if (r > 0.5) {
      console.log(`  [${ki.idx}] session RC4: ${(r*100).toFixed(0)}%`);
      const text = result.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
      if (text.length > 3) console.log(`    text: "${text.substring(0,50)}"`);
    }
  } catch(e) {}
});

console.log('\n=== 6. 整体 88B 各种模式 ===');
keys.forEach(ki => {
  if (ki.data.length < 16) return;
  const key = ki.data.slice(0, 16);
  const fullData = queries[0].bytes;
  ['ecb','ctr','cfb','ofb'].forEach(mode => {
    const iv = mode === 'ecb' ? null : Buffer.alloc(16);
    if (iv) Buffer.from(nonce).copy(iv);
    const dec = aesDecrypt(fullData, key, iv, mode);
    const r = asciiRatio(dec);
    if (r > 0.5) {
      console.log(`  [${ki.idx}] full ${mode}: ${(r*100).toFixed(0)}%`);
      // 检查 uuid 自洽
      if (dec && dec.length > 4) {
        // cookie 结构：[uuid 4B][nextarr]
        // 如果 query 也是类似结构
        const text = dec.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
        if (text.length > 3) console.log(`    text: "${text.substring(0,50)}"`);
      }
    }
  });
});

console.log('\n=== 7. session+request 合并 80B ===');
keys.forEach(ki => {
  if (ki.data.length < 16) return;
  const key = ki.data.slice(0, 16);
  const combined = [...session, ...request]; // 80 bytes = 5 blocks
  ['ecb','ctr','cfb','ofb','cbc'].forEach(mode => {
    let iv = null;
    if (mode === 'ecb') iv = null;
    else if (mode === 'cbc') iv = Buffer.alloc(16);
    else { iv = Buffer.alloc(16); Buffer.from(nonce).copy(iv); }
    const dec = aesDecrypt(combined, key, iv, mode);
    const r = asciiRatio(dec);
    if (r > 0.5) {
      console.log(`  [${ki.idx}] combined ${mode}: ${(r*100).toFixed(0)}%`);
      const text = dec.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
      if (text.length > 3) console.log(`    text: "${text.substring(0,60)}"`);
    }
  });
});

console.log('\n=== 8. 差分：同端点 request XOR ===');
// #0 和 #1 是同一端点 getGatewayConfig POST
var r0 = queries[0].request, r1 = queries[1].request;
var xor01 = r0.map((b,j) => b ^ r1[j]);
console.log('#0 XOR #1:', xor01.slice(0,16).join(','));
console.log('ascii ratio:', (asciiRatio(xor01)*100).toFixed(0)+'%');
// 如果明文相同（同端点同body），XOR = keystream diff（随机，低 ascii）
// 如果明文不同（不同 body），XOR 包含明文 diff

// #2 和 #3 是同一端点 security GET
var r2 = queries[2].request, r3 = queries[3].request;
var xor23 = r2.map((b,j) => b ^ r3[j]);
console.log('#2 XOR #3:', xor23.slice(0,16).join(','));
console.log('ascii ratio:', (asciiRatio(xor23)*100).toFixed(0)+'%');

console.log('\n=== 9. 尝试 numarrEncrypt(huffman) 逆向 ===');
// 如果 session_data 是 huffman 编码后再 AES 加密
// 需要 AES 解密后再 huffman 解码
// 但 AES 解密失败了
// 
// 反过来：如果 session_data 直接是 huffman 编码（无 AES）
// 尝试 huffman 解码
const { numarrDecrypt } = (() => {
  try {
    for (const k of Object.keys(require.cache)) delete require.cache[k];
    require('module-alias')(__dirname);
    const parser = require('@src/handler/parser/');
    return { numarrDecrypt: parser.numarrDecrypt };
  } catch(e) { return { numarrDecrypt: null }; }
})();

if (numarrDecrypt) {
  console.log('Trying huffman decode on session_data...');
  try {
    const dec = numarrDecrypt([...session]);
    console.log('Huffman decoded session:', dec ? dec.length + ' bytes' : 'null');
    if (dec && dec.length > 0) {
      const r = asciiRatio(dec);
      console.log('ascii:', (r*100).toFixed(0)+'%');
      const text = dec.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
      if (text.length > 3) console.log('text:', text.substring(0,50));
    }
  } catch(e) { console.log('Huffman error:', e.message.substring(0,60)); }
  
  console.log('Trying huffman decode on request_data...');
  try {
    const dec = numarrDecrypt([...request]);
    console.log('Huffman decoded request:', dec ? dec.length + ' bytes' : 'null');
    if (dec && dec.length > 0) {
      const r = asciiRatio(dec);
      console.log('ascii:', (r*100).toFixed(0)+'%');
    }
  } catch(e) { console.log('Huffman error:', e.message.substring(0,60)); }
}

console.log('\n=== 10. 尝试 XOR keys2 ===');
// cookie 的 xor 只异或前 16 字节
// query 可能也用 keys2 异或
for (const ki of keys) {
  if (ki.data.length < 16) continue;
  const key = ki.data.slice(0, 16);
  // XOR session 前 16 字节
  const xored = session.slice(0, 16).map((b, i) => b ^ key[i]);
  const r = asciiRatio(xored);
  if (r > 0.6) {
    console.log(`  [${ki.idx}] XOR session[0:16]: ${(r*100).toFixed(0)}%`);
    const text = xored.filter(b=>b>=32&&b<=126).map(b=>String.fromCharCode(b)).join('');
    if (text.length > 3) console.log(`    text: "${text}"`);
  }
  // XOR request 前 16 字节
  const xoredR = request.slice(0, 16).map((b, i) => b ^ key[i]);
  const rR = asciiRatio(xoredR);
  if (rR > 0.6) {
    console.log(`  [${ki.idx}] XOR request[0:16]: ${(rR*100).toFixed(0)}%`);
  }
}
