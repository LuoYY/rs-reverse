// 分析 JSVMP 编码器字节码 gS：长度、结构、opcode 分布
const states = require('./nx_md_states.json');
console.log('捕获状态数:', states.length);
// 分析每条状态的 gS
states.forEach((s, i) => {
  const gs = s.gS;
  const my = s.my;
  console.log('#' + i + ': gS.len=' + (gs ? gs.length : 0) + ' my.len=' + (my ? my.length : 0) + ' iH=' + s.iH + ' fL=' + s.fL + ' gS.head=' + (gs ? gs.slice(0, 15).join(',') : ''));
});
// 找 gS 长度分布
const lens = {};
states.forEach(s => { const l = s.gS ? s.gS.length : 0; lens[l] = (lens[l] || 0) + 1; });
console.log('\ngS 长度分布:', JSON.stringify(lens));
// 唯一 gS 数
const uniqueGS = new Set(states.map(s => JSON.stringify(s.gS)));
console.log('唯一 gS 数:', uniqueGS.size);
// 最长 gS 完整内容
const maxS = states.reduce((a, b) => (b.gS && b.gS.length > (a.gS ? a.gS.length : 0)) ? b : a);
console.log('\n最长 gS (len=' + (maxS.gS ? maxS.gS.length : 0) + '):');
console.log(JSON.stringify(maxS.gS));
console.log('\nmy (函数表):', JSON.stringify(maxS.my).slice(0, 500));
