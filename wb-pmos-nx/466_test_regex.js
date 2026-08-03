/** 466 正则测试 */
const s = '_$kw[_$fw[_$pG[ ++_$aJ]]]=_$bf;';
console.log('test [^\\]]+:', /\[[^\]]+\]\]=(?!=)/.test(s));
console.log('match:', s.match(/\[[^\]]+\]\]=(?!=)/));
// 逐步
console.log('step1:', /\[[^\]]+\]\]/.test(s));
console.log('step2:', /\[[^\]]+\]\]/.exec(s));
// 简化字符类
console.log('step3:', /\[\w+\[\w+\[[^\]]*\]\]\]/.test(s));
// 不用 [^]] 用 .*? 非贪婪
console.log('step4:', /\[\w+\[\w+\[.*?\]\]\]=/.test(s));
