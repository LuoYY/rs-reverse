// 对比两次 _$ez：确定性测试（本地固定 challenge）
const a = require('./nx_once_out.json');
const b = require('./nx_once_out2.json');
console.log('第一次 ez len:', a.ez ? a.ez.length : 0);
console.log('第二次 ez len:', b.ez ? b.ez.length : 0);
if (a.ez && b.ez) {
  const same = JSON.stringify(a.ez) === JSON.stringify(b.ez);
  console.log('两次 _$ez 完全相同?', same);
  if (!same) {
    const m = Math.min(a.ez.length, b.ez.length);
    const diffs = [];
    for (let i = 0; i < m; i++) if (a.ez[i] !== b.ez[i]) diffs.push(i);
    console.log('差异位置数:', diffs.length);
    console.log('前30差异:', diffs.slice(0, 30).join(','));
    if (diffs.length) {
      console.log('第一次 @diff:', diffs.slice(0, 8).map(i => a.ez[i]).join(','));
      console.log('第二次 @diff:', diffs.slice(0, 8).map(i => b.ez[i]).join(','));
    }
  } else {
    console.log('★ _$ez 完全确定（纯函数）');
  }
}
console.log('P len:', a.pLen, 'vs', b.pLen);
