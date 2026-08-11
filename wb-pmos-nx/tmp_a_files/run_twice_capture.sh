#!/bin/bash
cd /Users/luoyy/work/github/GitHub/rs-reverse_glm/wb-pmos-nx/tmp_a_files
node capture_k0_kt_same.js > /dev/null 2>&1
cp nx_k0_kt_same.json nx_k0_kt_run1.json
node capture_k0_kt_same.js > /dev/null 2>&1
cp nx_k0_kt_same.json nx_k0_kt_run2.json
node -e '
const r1=require("./nx_k0_kt_run1.json");
const r2=require("./nx_k0_kt_run2.json");
function cmp(name, a, b) {
  if (!a || !b) { console.log(name, "null"); return; }
  let same=0;
  const n=Math.max(a.length,b.length);
  for(let i=0;i<Math.min(a.length,b.length);i++) if(a[i]===b[i]) same++;
  console.log(name, "匹配:", same+"/"+Math.min(a.length,b.length), "len:", a.length, "vs", b.length);
}
cmp("k0", r1.k0Snap&&r1.k0Snap.k0, r2.k0Snap&&r2.k0Snap.k0);
cmp("ez", r1.k0Snap&&r1.k0Snap.ez&&r1.k0Snap.ez[1], r2.k0Snap&&r2.k0Snap.ez&&r2.k0Snap.ez[1]);
cmp("ktFinal", r1.ktFinal, r2.ktFinal);
// base 需要 cd，暂时比较 ktFinal[65:] 的 huffman 解码
function getTree(){let a=[];for(let i=1;i<255;i++)a.push({total:1,idx:i});a.push({total:6,idx:255},{total:45,idx:0});function p(it){for(let i=0;i<a.length;i++)if(it.total<=a[i].total){a.splice(i,0,it);return}a.push(it)}while(a.length>1){const[o1,t2]=a.slice(0,2);a=a.slice(2);p({total:o1.total+t2.total,first:o1,second:t2})}return a[0]}
function gEC(t,c={key:0,val:0},arr=[]){if(t.idx===undefined){gEC(t.first,{key:c.key<<1,val:c.val+1},arr);gEC(t.second,{key:(c.key<<1)+1,val:c.val+1},arr)}else arr[t.idx]=c;return arr}
const cfg=gEC(getTree());const byLen={};let maxL=0;for(let b=0;b<256;b++){const c=cfg[b];if(!c)continue;if(!byLen[c.val])byLen[c.val]={};byLen[c.val][c.key]=b;if(c.val>maxL)maxL=c.val}
function hdec(enc){const ans=[];let key=0,val=0;for(const byte of enc){for(let b=7;b>=0;b--){key=(key<<1)|((byte>>b)&1);val++;const mm=byLen[val];if(mm&&mm[key]!==undefined){ans.push(mm[key]);key=0;val=0}if(val>maxL){key=0;val=0}}}return ans}
if(r1.ktFinal&&r2.ktFinal){
  const k1=r1.ktFinal.slice(15,63),k2=r2.ktFinal.slice(15,63);
  const x1=r1.ktFinal.slice(65).map((v,i)=>i<16?(v^k1[i]):v);
  const x2=r2.ktFinal.slice(65).map((v,i)=>i<16?(v^k2[i]):v);
  const b1=hdec(x1),b2=hdec(x2);
  let same=0;
  for(let i=0;i<Math.min(b1.length,b2.length);i++) if(b1[i]===b2[i]) same++;
  console.log("base(huff)", "匹配:", same+"/"+Math.min(b1.length,b2.length), "len:", b1.length, "vs", b2.length);
  console.log("base1 head:", b1.slice(0,10).join(","));
  console.log("base2 head:", b2.slice(0,10).join(","));
}
'
