package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dop251/goja"
)

// ==================== SCD (LCG random) ====================

type scdGen struct{ state uint32 }

func newScd(seed uint32) *scdGen { return &scdGen{state: seed} }
func (s *scdGen) next() uint32 {
	s.state = 15679*(s.state&65535) + 2531011
	return s.state
}

// ==================== grenKeys + arraySwap ====================

func grenKeys(maxlen int) []string {
	keys := strings.Split("_$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "")
	var ans []string
	for i := 0; i < len(keys); i++ {
		for j := 0; j < len(keys); j++ {
			ans = append(ans, "_$"+keys[i]+keys[j])
			if len(ans) == maxlen {
				return ans
			}
		}
	}
	return ans
}

func arraySwap(arr []string, scd *scdGen) []string {
	knarr := make([]string, len(arr))
	copy(knarr, arr)
	l := len(knarr)
	for l > 1 {
		l--
		idx := int(scd.next()) % l
		if idx < 0 {
			idx = -idx
		}
		knarr[l], knarr[idx] = knarr[idx], knarr[l]
	}
	return knarr
}

func genKeynames(keynameNum int, nsd uint32) []string {
	return arraySwap(grenKeys(keynameNum), newScd(nsd))
}

// ==================== constData ====================

var goBignum [256]uint32
var goDecryptKeys [6]map[int]int

func initConstData(basestr string) {
	for i := 0; i < 256; i++ {
		item := uint32(i)
		for j := 0; j < 8; j++ {
			if item&1 != 0 {
				item = 3988292384 ^ item>>1
			} else {
				item >>= 1
			}
		}
		goBignum[i] = item
	}
	for i := 0; i < 6; i++ {
		goDecryptKeys[i] = make(map[int]int)
	}
	for idx, ch := range basestr {
		code := int(ch)
		goDecryptKeys[0][code] = idx << 2
		goDecryptKeys[1][code] = idx >> 4
		goDecryptKeys[2][code] = (idx & 15) << 4
		goDecryptKeys[3][code] = idx >> 2
		goDecryptKeys[4][code] = (idx & 3) << 6
		goDecryptKeys[5][code] = idx
	}
}

// ==================== decrypt cd ====================

func decryptCd(str string) []int {
	d := goDecryptKeys
	var ans []int
	runes := []rune(str)
	for i := 0; i < len(runes); i += 4 {
		one := int(runes[i])
		if i+1 < len(runes) {
			ans = append(ans, d[0][one]|d[1][int(runes[i+1])])
		}
		if i+2 < len(runes) {
			ans = append(ans, d[2][int(runes[i+1])]|d[3][int(runes[i+2])])
		}
		if i+3 < len(runes) {
			ans = append(ans, d[4][int(runes[i+2])]|d[5][int(runes[i+3])])
		}
	}
	return ans
}

// ==================== tscd: parse cd -> keys ====================

func getValMaps(cp3 int) []int {
	uid := uint32(cp3)
	var u32s []uint32
	for i := 0; i < 4; i++ {
		uid = 15679*(uid&65535) + 2531011
		u32s = append(u32s, uid)
	}
	return numToNumarr4Ints(u32s)
}

func parseCdSection(arr []int, cp3 int) []int {
	l := len(arr)
	valMap := getValMaps(cp3)
	idx := 4
	for {
		idx += 16
		modBase := 16
		if l-idx < 16 && l-idx > 0 {
			modBase = l - idx
		}
		if modBase > 0 {
			mod := idx % modBase
			if mod+idx < len(arr) {
				arr[mod+idx] ^= valMap[mod]
			}
		}
		if idx >= l {
			break
		}
	}
	return arr
}

func getLensGo(numarr []int, idx int) (int, int) {
	item := numarr[idx]
	idx++
	var lens int
	switch {
	case item&128 == 0:
		lens = item
	case item&192 == 128:
		lens = (item&63)<<8 | numarr[idx]
		idx++
	case item&224 == 192:
		lens = (item&31)<<16 | numarr[idx]<<8 | numarr[idx+1]
		idx += 2
	case item&240 == 224:
		lens = (item&15)<<24 | numarr[idx]<<16 | numarr[idx+1]<<8 | numarr[idx+2]
		idx += 3
	case item&248 == 240:
		lens = int(uint32(numarr[idx]<<24 | numarr[idx+1]<<16 | numarr[idx+2]<<8 | numarr[idx+3]))
		idx += 4
	default:
		lens = item
	}
	return lens, idx
}

func genKeysFromCd(ans []int) [][]int {
	for step := 2; step > 0; step-- {
		var keys [][]int
		op := 1
		valid := true
		numKeys := ans[0]
		fmt.Fprintf(os.Stderr, "  genKeys step=%d numKeys=%d ansLen=%d\n", step, numKeys, len(ans))
		for i := 0; i < numKeys; i++ {
			if op >= len(ans) {
				fmt.Fprintf(os.Stderr, "  genKeys: op(%d) >= len(%d) at key %d\n", op, len(ans), i)
				valid = false
				break
			}
			var gap int
			if step == 2 {
				if op+1 >= len(ans) {
					valid = false
					break
				}
				gap = ans[op]<<8 | ans[op+1]
				op += 2
			} else {
				gap, op = getLensGo(ans, op)
			}
			if gap < 0 || op+gap > len(ans) {
				fmt.Fprintf(os.Stderr, "  genKeys: gap=%d op=%d out of bounds (len=%d) at key %d\n", gap, op, len(ans), i)
				valid = false
				break
			}
			keys = append(keys, ans[op:op+gap])
			op += gap
		}
		if !valid || len(keys) == 0 {
			fmt.Fprintf(os.Stderr, "  genKeys step %d: invalid, %d keys parsed\n", step, len(keys))
			continue
		}
		for _, k := range []int{29, 30, 31, 32} {
			if k >= len(keys) || len(keys[k]) != 4 {
				fmt.Fprintf(os.Stderr, "  genKeys step %d: keys[%d] len=%d (expected 4)\n", step, k, func() int { if k < len(keys) { return len(keys[k]) }; return -1 }())
				valid = false
				break
			}
		}
		if valid {
			return keys
		}
	}
	panic("genKeys failed")
}

func parseCdToKeys(cd string, cp3 int) [][]int {
	cdArr := decryptCd(cd)
	start := 2
	end := (cdArr[0]<<8 | cdArr[1]) + start

	// Parse the task section (modifies a copy)
	one := make([]int, end-start)
	copy(one, cdArr[start:end])
	parseCdSection(one, cp3)

	// The offset is computed by runTaskByUid('U14124020') in the JS pipeline
	// It's NOT constant - it varies per cd. We need to compute it.
	// The offset comes from the task structure in `one` (the parsed cd section)
	// For now, we cannot compute it in pure Go (needs Proxy/eval/codemap)
	// The offset XORs the remaining cd bytes before genKeys
	ans := cdArr[end:]

	// TODO: compute offset from task structure
	// For now, return error
	_ = ans
	return nil
}

// ==================== helpers ====================

func goAscii2string(numarr []int) string {
	var sb strings.Builder
	for _, n := range numarr {
		sb.WriteRune(rune(n))
	}
	return sb.String()
}

func goString2ascii(s string) []int {
	var ans []int
	for _, r := range s {
		ans = append(ans, int(r))
	}
	return ans
}

func goUuidBytes(data []int) uint32 {
	var val uint32 = 0xFFFFFFFF
	for _, b := range data {
		val = val>>8 ^ goBignum[(val^uint32(b))&0xFF]
	}
	return val ^ 0xFFFFFFFF
}

func numToNumarr2Int(num int) []int {
	if num < 0 {
		num = 0
	} else if num > 65535 {
		num = 65535
	}
	return []int{num >> 8, num & 255}
}

func numToNumarr4Ints(nums []uint32) []int {
	var ans []int
	for _, n := range nums {
		ans = append(ans, int(n>>24)&255, int(n>>16)&255, int(n>>8)&255, int(n)&255)
	}
	return ans
}

func numToNumarr4Int(v uint32) []int {
	return []int{int(v>>24) & 255, int(v>>16) & 255, int(v>>8) & 255, int(v) & 255}
}

func numToNumarr8Int(num int64) []int {
	if num < 0 {
		num = 0
	}
	hi := uint32(num / 4294967296)
	lo := uint32(num % 4294967296)
	return []int{
		int(hi>>24) & 255, int(hi>>16) & 255, int(hi>>8) & 255, int(hi) & 255,
		int(lo>>24) & 255, int(lo>>16) & 255, int(lo>>8) & 255, int(lo) & 255,
	}
}

// ==================== goja outer VM ====================

func runOuterVMGoja(nsd int, cd, outerJsCode string) (int, error) {
	vm := goja.New()
	var capturedEvals []string

	vm.Set("document", map[string]interface{}{
		"cookie": "", "createElement": func() map[string]interface{} { return map[string]interface{}{"style": map[string]interface{}{}, "setAttribute": func() {}, "getElementsByTagName": func() []interface{} { return nil }} },
		"getElementsByTagName": func() []interface{} { return nil },
		"documentElement":      map[string]interface{}{"style": map[string]interface{}{}},
		"body":                 map[string]interface{}{"appendChild": func() {}}, "hidden": false,
	})
	vm.Set("navigator", map[string]interface{}{
		"userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		"platform": "MacIntel", "maxTouchPoints": 0, "appName": "Netscape", "appVersion": "5.0", "language": "zh-CN",
	})
	vm.Set("screen", map[string]interface{}{"width": 1680, "height": 1050, "availWidth": 1680, "availHeight": 1025, "colorDepth": 24})
	vm.Set("location", map[string]interface{}{"href": "https://pmos.xj.sgcc.com.cn:20080/", "pathname": "/", "hostname": "pmos.xj.sgcc.com.cn", "protocol": "https:", "reload": func() {}, "replace": func() {}})
	vm.Set("$_ts", map[string]interface{}{"nsd": nsd, "cd": cd})
	vm.Set("setTimeout", func(fn goja.Callable) int { fn(goja.Undefined()); return 0 })
	vm.Set("setInterval", func() int { return 0 })
	vm.Set("clearInterval", func() {})
	vm.Set("clearTimeout", func() {})
	vm.Set("eval", func(call goja.FunctionCall) goja.Value {
		code := call.Argument(0)
		if code != goja.Undefined() && code != goja.Null() {
			s := code.String()
			if len(s) > 50000 {
				capturedEvals = append(capturedEvals, s)
			}
		}
		return goja.Undefined()
	})
	vm.RunString("var window = this; var self = this; var globalThis = this;")
	vm.RunString(outerJsCode) // ignore errors

	var dyn string
	for _, c := range capturedEvals {
		if len(c) > len(dyn) {
			dyn = c
		}
	}
	if dyn == "" {
		return 0, fmt.Errorf("no dynamic code")
	}
	sum := 0
	for i := 0; i < len(dyn); i += 100 {
		sum += int(dyn[i])
	}
	return sum, nil
}

// ==================== full keygen ====================

func runFullKeygenGo(nsd int, cd, baseUrl string) (*KeygenData, error) {
	rootDir, _ := getWd()
	outerJs, err := readFile(filepath.Join(rootDir, "example", "pmos.xj.sgcc.com.cn", "kmOJZ0KVxJ0R", "rGTR1U4jJCVr.303c6e9.js"))
	if err != nil {
		return nil, err
	}
	cp3, err := runOuterVMGoja(nsd, cd, string(outerJs))
	if err != nil {
		return nil, err
	}

	basestr := "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	initConstData(basestr)
	keys := parseCdToKeys(cd, cp3)

	now := time.Now()
	runTime := int(now.Unix())
	startTime := runTime - 1
	r2mkaTime := 0
	if len(keys) > 21 && len(keys[21]) > 0 {
		fmt.Sscanf(goAscii2string(keys[21]), "%d", &r2mkaTime)
	}
	codeUid := 0

	basearr := buildBasearrGo(keys, r2mkaTime, startTime, runTime, codeUid)

	if basearr == nil {
		return nil, fmt.Errorf("basearr generation not yet implemented in pure Go")
	}

	return &KeygenData{
		Basearr:      basearr,
		Keys2:        keys[2],
		Keys16:       keys[16],
		Keys17:       keys[17],
		R2mkaTime:    r2mkaTime,
		StartTime:    startTime,
		RunTime:      runTime,
		CodeUid:      codeUid,
		Basestr:      basestr,
		CookieName:   "aoU85Lxl9xxNP",
		CookiePrefix: "0",
	}, nil
}

func buildBasearrGo(keys [][]int, r2mkaTime, startTime, runTime, codeUid int) []int {
	// TODO: implement full basearr generation (len243.js port)
	return nil
}

// runKeygenGoja: try pure Go first, fall back to Node.js helper
func runKeygenGoja(nsd int, cd, baseUrl string) (*KeygenData, error) {
	return runFullKeygenGo(nsd, cd, baseUrl)
}
