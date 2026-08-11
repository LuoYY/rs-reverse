// 分析 op=1464/1465 的输入值（base 编码数据来源）
const calls = require('./nx_1464_calls.json');
console.log('记录数:', calls.length);
calls.forEach((c, i) => {
  const fmt = (v) => {
    if (Array.isArray(v)) return 'arr[' + v.length + '] ' + v.slice(0, 8).join(',');
    if (typeof v === 'string') return 'str:' + v.slice(0, 20);
    return String(v).slice(0, 20);
  };
  console.log('#' + i + ' pc=' + c.p + ' e=' + fmt(c.e) + ' | l=' + fmt(c.l) + ' | b=' + fmt(c.b) + ' | cV=' + c.cV + ' | kt.len=' + (c.kt ? c.kt.length : 0));
});
