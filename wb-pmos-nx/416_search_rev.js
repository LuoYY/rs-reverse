/**
 * 416_search_rev.js
 * 搜反转的属性名（documentMode→edomtnuoc 等）+ 解码所有反转字符串
 */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');

// 搜反转的 documentMode
const targets = {
  documentMode: 'edomtnuoc',
  documentElement: 'tnemelEtnemucod',
  compatMode: 'edoMtapmoc',
  doScroll: 'llorcSod',
  readyState: 'etaStydaer',
  characterSet: 'teSretcarahc',
  navigator: 'rotagivan',
  userAgent: 'tneAgresu',
  platform: 'mroftalp',
  language: 'egaugnal',
  cookieEnabled: 'delbaneikooc',
  webdriver: 'revirdbew',
  devicePixelRatio: 'otiRleixPeiciveD',
  colorDepth: 'htpeDroloc',
  pixelDepth: 'htpeDlexip',
  visibilityState: 'etaStytilibisiv',
};
for (const [name, rev] of Object.entries(targets)) {
  const idx = code.indexOf(rev);
  if (idx >= 0) {
    console.log(`✓ ${name} (反转 '${rev}') @${idx}:`, code.substring(idx - 40, idx + 30).replace(/\n/g, ' '));
  }
}

// 通用：找所有 'xxx' 字符串字面量（可能反转），解码常见属性名
console.log('\n=== 反转字符串字面量（可能属性名）===');
const strs = code.match(/'(?:[a-zA-Z]{3,})'/g);
const revStrs = [];
if (strs) {
  for (const s of strs) {
    const inner = s.slice(1, -1);
    const rev = inner.split('').reverse().join('');
    // 反转后是常见属性名（小写开头或驼峰）
    if (/^(document|navigator|window|screen|location|body|all|head|doctype|compatMode|documentMode|documentElement|readyState|visibility|character|color|pixel|device|platform|userAgent|language|cookie|webdriver|width|height|inner)/.test(rev)) {
      revStrs.push(rev);
    }
  }
}
console.log('反转后常见属性:', revStrs.slice(0, 30));
console.log('总数:', revStrs.length);
