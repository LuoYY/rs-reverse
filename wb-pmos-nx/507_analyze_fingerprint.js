/** 507 离线分析动态代码的环境检测（canvas/webgl/audio 等指纹生成） */
const fs = require('fs');
const code = fs.readFileSync('/tmp/nx_dyncode_raw.js', 'utf8');
console.log('dyn len:', code.length);

// 搜环境检测关键词
const kws = ['getContext', 'canvas', 'webgl', 'AudioContext', 'createElement', 'getImageData', 'toDataURL',
  'font', 'measureText', 'canvas.toDataURL', 'WebGLRenderingContext', 'GLSL', 'shader', 'getParameter', 'readPixels'];
for (const kw of kws) {
  const c = (code.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (c) console.log(kw + ':', c);
}

// 搜 16 字节指纹相关（环境数组 -> hash）
console.log('\n=== getImageData/toDataURL 上下文 ===');
let idx = 0, cnt = 0;
while ((idx = code.indexOf('getImageData', idx)) !== -1) {
  cnt++;
  console.log(`#${cnt} @${idx}: ${code.substring(Math.max(0, idx - 60), idx + 40).replace(/\n/g, ' ')}`);
  idx += 12;
  if (cnt > 4) break;
}

// 搜 hash 相关（MD5/SHA/随机指纹）
console.log('\n=== 指纹计算相关 ===');
for (const kw of ['toDataURL', 'charCodeAt', 'String.fromCharCode', 'toString(16)', 'join(']) {
  const c = (code.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (c) console.log(kw + ':', c);
}
