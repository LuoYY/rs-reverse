/**
 * query_jsdom_vm.js - 用 jsdom 完整执行 RS 动态代码 + 生成 query
 *
 * jsdom 已验证能完整执行 RS 动态代码并生成 cookie
 * jsdom 的 window.eval 在主进程上下文中执行（栈更大）
 * 
 * 方案：
 * 1. 用 jsdom 创建完整浏览器环境
 * 2. 注入管线 cookie（让 RS 认为已验证）
 * 3. 执行 RS 外层 JS -> 动态代码执行 -> RS hook XHR
 * 4. 触发 XHR POST -> RS 生成 query
 * 5. 从 URL 修改中捕获 query
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_OPTIONS = '--dns-result-order=ipv4first';

const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = __dirname;
const TARGET = 'https://pmos.xj.sgcc.com.cn:20080/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUTER_JS = path.join(ROOT, 'example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js');

function makeAnchorEl() {
  var el = { tagName:'A',nodeName:'A',nodeType:1,style:new Proxy({},{get:()=>'',set:()=>true}),children:[],childNodes:[],
    setAttribute:function(n,v){if(n==='href')this.href=String(v);},getAttribute:function(n){return n==='href'?this._href||'':null;},
    removeAttribute(){},appendChild(c){return c;},removeChild(c){return c;},addEventListener(){},removeEventListener(){},_href:'',_url:null};
  Object.defineProperty(el,'href',{get:function(){return this._href;},set:function(v){this._href=String(v);try{var b=TARGET;try{this._url=new URL(this._href,b);}catch(e){this._url={href:this._href,protocol:'',host:'',hostname:'',port:'',pathname:this._href,search:'',hash:'',origin:b};}}catch(e){}},configurable:true});
  ['protocol','host','hostname','port','pathname','search','hash','origin'].forEach(function(p){Object.defineProperty(el,p,{get:function(){return this._url?(this._url[p]||''):'';},set:function(){},configurable:true});});
  el.innerHTML='';el.innerText='';el.textContent='';el.className='';el.id='';el.clientWidth=0;el.clientHeight=0;
  el.getBoundingClientRect=function(){return{top:0,left:0,right:0,bottom:0,width:0,height:0};};
  el.getElementsByTagName=function(){return[];};el.querySelector=function(){return null;};el.querySelectorAll=function(){return[];};
  el.cloneNode=function(){return makeAnchorEl();};el.remove=function(){};el.parentNode=null;el.parentElement=null;el.firstChild=null;el.lastChild=null;el.nextSibling=null;
  return el;
}

(async () => {
  console.log('=== jsdom 完整执行 RS + 生成 query ===\n');

  // Step 1: 管线生成 cookie
  console.log('[1] 管线生成 cookie...');
  const { httpGet } = require('./proxy_http');
  var ch = await httpGet(TARGET, { userAgent: UA });
  var nsd = +(ch.body.match(/nsd=(\d+)/)||[])[1];
  var cd = (ch.body.match(/cd="([^"]+)"/)||[])[1];
  var sc = [].concat(ch.headers['set-cookie'] || []);
  var oCookie = sc.map(c => c.split(';')[0]).find(c => c.indexOf('O=') >= 0) || sc[0].split(';')[0];
  
  const { PmosXjClientProxy } = require('./pmos_xj_client_proxy');
  var client = new PmosXjClientProxy();
  await client.init();
  var cp3 = client._extractCp3(nsd, cd);
  var gen = await client._genCookie({nsd,cd,from:TARGET,hasDebug:false,keynameNum:909,cp3Override:cp3}, cp3);
  var seedCookie = oCookie + '; ' + gen.name + '=' + gen.cookie;
  console.log('  Cookie ready');

  // Step 2: jsdom 环境
  console.log('\n[2] 创建 jsdom 环境...');
  const outerJsCode = fs.readFileSync(OUTER_JS, 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: TARGET,
    userAgent: UA,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  
  // 设置 $_ts
  window.$_ts = { nsd, cd };
  
  // Cookie 管理
  var cj = seedCookie;
  var cookies = [];
  Object.defineProperty(window.document, 'cookie', {
    get() { return cj; },
    set(v) { cookies.push(v); cj = cj ? cj + '; ' + v : v; },
    configurable: true,
  });
  
  // 增强 createElement('a')
  var origCreateElement = window.document.createElement.bind(window.document);
  window.document.createElement = function(tag) {
    if (String(tag).toLowerCase() === 'a') return makeAnchorEl();
    return origCreateElement(tag);
  };
  
  // 捕获 XHR URL 修改
  var capturedQuery = null;
  var origXHR = window.XMLHttpRequest;
  
  // 不替换 XMLHttpRequest（让 RS 自己 hook）
  // 但我们需要捕获 send 时的 URL
  // 方法：在 RS hook 之后，再包装一层
  
  // Step 3: 执行 RS 外层 JS
  console.log('\n[3] 执行 RS 外层 JS...');
  try {
    window.eval(outerJsCode);
    console.log('  Outer JS executed');
  } catch(e) {
    console.log('  Outer JS error:', e.message.substring(0, 100));
  }
  
  // 等待动态代码执行
  await new Promise(r => setTimeout(r, 3000));
  console.log('  Waited 3s for dynamic code');
  
  // Step 4: 检查 RS hook
  console.log('\n[4] 检查 RS hook...');
  var sendFn = window.XMLHttpRequest.prototype.send;
  var openFn = window.XMLHttpRequest.prototype.open;
  
  var sendStr = '';
  var sendName = '';
  try { sendStr = sendFn ? sendFn.toString().substring(0, 80) : 'none'; } catch(e) { sendStr = 'err'; }
  try { sendName = sendFn ? sendFn.name : 'none'; } catch(e) { sendName = 'err'; }
  
  console.log('  send.name:', sendName);
  console.log('  send.toString:', sendStr.substring(0, 60));
  
  var isRsHooked = sendName && sendName.indexOf('_$') === 0;
  if (!isRsHooked) {
    // 检查 open
    var openName = '';
    try { openName = openFn ? openFn.name : 'none'; } catch(e) {}
    isRsHooked = openName && openName.indexOf('_$') === 0;
    console.log('  open.name:', openName);
  }
  
  console.log('  RS hooked:', isRsHooked ? 'YES ★' : 'NO');
  
  if (isRsHooked) {
    // Step 5: 触发 XHR POST
    console.log('\n[5] 触发 XHR POST...');
    
    // 创建 XHR 并 open
    var xhr = new window.XMLHttpRequest();
    window.XMLHttpRequest.prototype.open.call(xhr, 'POST', '/px-gateway/GatewayConfig/getGatewayConfig', true);
    
    // 检查实例属性
    var rsProps = {};
    var allProps = Object.getOwnPropertyNames(xhr);
    allProps.forEach(function(k) {
      if (k.indexOf('_$') === 0) rsProps[k] = typeof xhr[k];
    });
    console.log('  RS props:', JSON.stringify(rsProps));
    
    // 设置 boolean 为 true
    allProps.forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr[k] === 'boolean') xhr[k] = true;
    });
    
    // 找到 trampoline
    var tramp = null;
    allProps.forEach(function(k) {
      if (k.indexOf('_$') === 0 && typeof xhr[k] === 'function') tramp = xhr[k];
    });
    
    if (tramp) {
      console.log('  Trampoline found');
      
      // 调用 trampoline
      var result = '';
      try {
        result = tramp.call(xhr, '{}') || '';
      } catch(e) {
        console.log('  Trampoline error:', e.message.substring(0, 80));
      }
      
      console.log('  Result type:', typeof result);
      console.log('  Result length:', typeof result === 'string' ? result.length : -1);
      console.log('  Result:', String(result).substring(0, 80));
      
      if (typeof result === 'string' && result.length > 10) {
        console.log('\n★★★★★ QUERY GENERATED! ★★★★★');
        console.log('Query:', result);
        
        // 保存
        fs.writeFileSync(
          path.join(ROOT, 'output/capture-20080/query-jsdom-generated.json'),
          JSON.stringify({ query: result, nsd, cd, timestamp: new Date().toISOString() }, null, 2)
        );
        console.log('Saved!');
      } else {
        console.log('\n  Trampoline returned empty');
        
        // 尝试调用 send（RS 的 send hook 会生成 query）
        console.log('\n[6] 尝试调用 send...');
        try {
          xhr.send('{}');
          // 检查 URL 是否被修改
          if (xhr._url && xhr._url.indexOf('r20SZOQm=') >= 0) {
            var qMatch = xhr._url.match(/r20SZOQm=([^&]+)/);
            if (qMatch) {
              console.log('  ★★★ Query from send URL:', qMatch[1].substring(0, 60) + '...');
              capturedQuery = qMatch[1];
            }
          }
          // 检查 responseURL
          if (xhr.responseURL && xhr.responseURL.indexOf('r20SZOQm=') >= 0) {
            var qMatch2 = xhr.responseURL.match(/r20SZOQm=([^&]+)/);
            if (qMatch2) {
              console.log('  ★★★ Query from responseURL:', qMatch2[1].substring(0, 60) + '...');
              capturedQuery = qMatch2[1];
            }
          }
        } catch(e) {
          console.log('  Send error:', e.message.substring(0, 80));
        }
        
        // 检查 cookie 是否被更新
        console.log('\n[7] 检查 cookie 更新...');
        console.log('  Cookies captured:', cookies.length);
        cookies.slice(-3).forEach(function(c, i) {
          console.log('  [' + i + ']', c.substring(0, 60) + '...');
        });
      }
    } else {
      console.log('  No trampoline found on XHR');
    }
  } else {
    console.log('\n  RS did not hook XHR');
    console.log('  send:', sendStr.substring(0, 100));
  }
  
  // 清理
  window.close();
  
  console.log('\n=== 完成 ===');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
