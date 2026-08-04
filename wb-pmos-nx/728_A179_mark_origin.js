/**
 * 728_A179_mark_origin.js
 * 分析明文 basearr 每 16 字节块第 8 字节替换值的来源
 * 替换值 = 块内其他字节的函数？还是 keys/环境？
 * 用 746 3 会话数据（有 b86）+ 浏览器明文（有替换值）
 */
const fs = require('fs');

(async () => {
  // 浏览器明文（134）：找出每 16 字节块第 8 字节（位置 8, 24, 40, 56, ...）
  const plain = JSON.parse(fs.readFileSync('/tmp/nx_browser_plain_full.json', 'utf8')).arr;
  console.log('明文 len:', plain.length);
  console.log('明文完整:', plain.join(','));
  console.log('\n明文每 16 字节块:');
  for (let i = 0; i < plain.length; i += 16) {
    const block = plain.slice(i, i + 16);
    console.log(`块@${i}: ${block.join(',')}`);
  }

  // b86 对应（明文 ≈ b86[2:]，块第 8 字节不同）
  const NX_BS = 'qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^';
  function decodeB86(str) {
    const idxmap = {}; for (let i = 0; i < 64; i++) idxmap[NX_BS[i]] = i;
    const bytes = []; let qi = 0;
    for (let g = 0; g < Math.floor(str.length / 4); g++) {
      const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]], c3 = idxmap[str[qi + 3]];
      if (c0 === undefined) return null;
      qi += 4;
      bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2), ((c2 & 3) << 6) | c3);
    }
    const rem = str.length - qi;
    if (rem === 2) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4)); }
    else if (rem === 3) { const c0 = idxmap[str[qi]], c1 = idxmap[str[qi + 1]], c2 = idxmap[str[qi + 2]]; if (c0 === undefined) return null; bytes.push((c0 << 2) | (c1 >> 4), ((c1 & 15) << 4) | (c2 >> 2)); }
    return bytes;
  }
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd = rawBody.match(/cd="([^"]+)"/)[1];
  const b86 = decodeB86(cd);

  console.log('\n明文 vs b86[2:] 差异位置:');
  for (let i = 0; i < plain.length; i++) {
    if (plain[i] !== b86[i + 2]) console.log(`  位置 ${i}: 明文=${plain[i]} b86=${b86[i + 2]}`);
  }

  // 替换值是否 = 块内第 0 字节的函数？块 0 是 113 头（不替换），从块 1 开始
  // 明文[24] = 0, 明文[40] = 39?, ...
  console.log('\n替换值与块内其他字节:');
  for (let i = 16; i < plain.length; i += 16) {
    if (plain[i] !== b86[i + 2]) {
      const block = plain.slice(i - 8, i + 8);
      console.log(`块@${i}: 替换值=${plain[i]} (b86=${b86[i+2]}) 块前8=${block.slice(0,8).join(',')} 块后7=${block.slice(9).join(',')}`);
    }
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
