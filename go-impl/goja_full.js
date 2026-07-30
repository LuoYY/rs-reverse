// This script runs inside goja to compute keys + basearr
// It receives nsd, cd, cp3, outerJsCode via goja.Set
// It outputs JSON with all keygen data

// Minimal environment for the pipeline
var window = this;
var self = this;
var globalThis = this;
var document = {
  cookie: "",
  createElement: function() { return { style: {}, setAttribute: function(){}, getElementsByTagName: function() { return []; } }; },
  getElementsByTagName: function() { return []; },
  documentElement: { style: {} },
  body: { appendChild: function() {} },
  hidden: false,
};
var navigator = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  platform: "MacIntel",
  maxTouchPoints: 0,
  appName: "Netscape",
  appVersion: "5.0",
  language: "zh-CN",
};
var screen = { width: 1680, height: 1050, availWidth: 1680, availHeight: 1025, colorDepth: 24 };
var location = {
  href: "https://pmos.xj.sgcc.com.cn:20080/",
  pathname: "/",
  hostname: "pmos.xj.sgcc.com.cn",
  protocol: "https:",
  reload: function() {},
  replace: function() {},
};

// Capture eval output
var __capturedEvals = [];
var __origEval = eval;
eval = function(code) {
  if (code && code.length > 50000) {
    __capturedEvals.push(code);
  }
};

function setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; }
function setInterval() { return 0; }
function clearInterval() {}
function clearTimeout() {}

// Run outer JS to generate dynamic code
__origEval(outerJsCode);

// Find the dynamic code
var dynCode = "";
for (var i = 0; i < __capturedEvals.length; i++) {
  if (__capturedEvals[i].length > dynCode.length) dynCode = __capturedEvals[i];
}

// The dynamic code defines $_ts with cp, etc.
// After running outer JS, window.$_ts should have the dynamic code
// Actually, the outer JS calls eval() with the dynamic code
// We captured it in __capturedEvals

// Output: just the dynamic code for cp3 computation
// The Go side will handle the rest
JSON.stringify({
  dynamicCodeLength: dynCode.length,
  dynamicCodeSum: (function() {
    var sum = 0;
    for (var i = 0; i < dynCode.length; i += 100) sum += dynCode.charCodeAt(i);
    return sum;
  })(),
});
