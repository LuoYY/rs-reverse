const d = require('./nx_pools_same.json');
console.log('_$k0[35] =', JSON.stringify(d.pools.k0[35]));
console.log('_$k0[18] =', JSON.stringify(d.pools.k0[18]));
console.log('_$k0[5] =', JSON.stringify(d.pools.k0[5]));
// op383: _$lj= !_$mD[12][0]&&(_$ps||(_$p1&&_$$p))
// _$mD[12][0]=_$k0[35]
// 若 _$k0[35]=1 → !1=false → _$lj=false（buildEnv 行为）
// 若 _$k0[35]=0 → !0=true → _$lj=(_$ps||...)
// 真实浏览器 _\$mD[12][0] 应该使 _$lj=true？
// 看 _$ps 等来源
