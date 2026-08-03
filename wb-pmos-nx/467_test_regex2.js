/** 467 逐步测试 = 部分 */
const s = '_$kw[_$fw[_$pG[ ++_$aJ]]]=_$bf;';
console.log('1:', /\[[^\]]+\]\]\=/.test(s));
console.log('2:', /\[[^\]]+\]\]=/.test(s));
console.log('3:', /\[[^\]]+\]\]=_/.test(s));
console.log('4:', /\]=/.test(s));
// exec 看匹配
const m = /\[[^\]]+\]\]/.exec(s);
console.log('m[0]:', JSON.stringify(m[0]), 'after:', JSON.stringify(s[m.index + m[0].length]));
// 完整
const m2 = /\[[^\]]+\]\]\=/.exec(s);
console.log('m2:', m2 ? JSON.stringify(m2[0]) : 'null');
// 用 .*? 
console.log('5:', /\[\w+\[\w+\[.*?\]\]\]=/.exec(s));
