const d = require('./nx_pools_same.json');
console.log('_$oP[148] =', JSON.stringify(d.pools.oP[148]));
console.log('_$oP[113] =', JSON.stringify(d.pools.oP[113]));
// _$a2=window（sandbox），window[oP[148]] 应该是什么？
// buildEnv sandbox 有哪些属性？
// opcode 343: _$_f=_$a2[_$oP[148]]
// 如果 oP[148]='getSelection' 等，sandbox 有
