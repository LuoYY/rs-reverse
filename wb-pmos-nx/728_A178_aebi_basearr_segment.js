/**
 * 728_A178_aebi_basearr_segment.js
 * 从 aebi（挑战 js 生成，与浏览器一致）中查找 basearr 生成程序
 * aebi[0..5] = [648,2553,2479,431,38,7]
 * basearr 明文构造程序 = program2/3（9B + 47B），在 aebi 中搜索
 */
const fs = require('fs');

(async () => {
  // 挑战 js 生成的 aebi（从沙箱提取，与浏览器一致）
  const raw = fs.readFileSync('/Users/luoyy/work/github/GitHub/rs-reverse_glm/nx-mock/412.raw', 'utf8');
  const rawBody = raw.substring(raw.indexOf('\r\n\r\n') + 4);
  const cd = rawBody.match(/cd="([^"]+)"/)[1];

  // 从浏览器捕获的 VM 程序
  const prog = JSON.parse(fs.readFileSync('/tmp/nx_browser_programs.json', 'utf8'));
  const programs = [];
  for (const p of prog.programs) for (const h of (p.hr || [])) if (h && h.gS) programs.push(h.gS);
  console.log('捕获的 VM 程序:', programs.map(g => g.length + 'B').join(', '));
  console.log('program2:', programs[0] ? programs[0].join(',') : '');
  console.log('program3:', programs[1] ? programs[1].join(',') : '');

  // 检查 aebi 是否正确（用 412.raw + 挑战 js 沙箱）
  // 简化：挑战 js 生成 aebi 已确认 [648,2553,2479,431,38,7]
  // program2 = [49,1,0,63,1,4,86,12,0]
  // program3 = [11,63,1,2,56,14,2,11,63,1,2,56,14,3,...]
  // 这些程序是 _\$gS（内层 VM bytecode），由 aebi 解码或独立存储
  // 在 dynCode（应用 js）中搜索这些字节序列
  const dynCode = fs.readFileSync('/tmp/nx_appjs_vm_dyn.js', 'utf8');
  const p2 = [49,1,0,63,1,4,86,12,0];
  const p2str = String.fromCharCode(...p2);
  const idx = dynCode.indexOf(p2str);
  console.log('\nprogram2 字节序列在 dynCode 中:', idx >= 0 ? '找到 @' + idx : '未找到');
  // 转义搜索
  const p2arr = [];
  for (const b of p2) p2arr.push('\\\\x' + b.toString(16).padStart(2, '0'));
  console.log('program2 转义:', p2arr.join(''));

  // 检查应用 dynCode 是否有 _\$gS 相关（内层 VM bytecode 存储）
  const gSIdx = dynCode.indexOf('_$gS');
  console.log('_\$gS 在 dynCode:', gSIdx >= 0 ? '@' + gSIdx : '未找到');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
