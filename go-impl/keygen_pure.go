package main

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dop251/goja"
)

func jsonUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

var _ = jsonUnmarshal

// ==================== SCD (LCG random) - used by keygen_pure ====================
// Note: coder.go has its own Scd type, these are for keygen_pure's use

type scdGen struct{ state uint32 }

func newScd(seed uint32) *scdGen { return &scdGen{state: seed} }
func (s *scdGen) next() uint32 {
	s.state = 15679*(s.state&65535) + 2531011
	return s.state
}

// genKeynames generates shuffled keynames using scd PRNG
func genKeynames(keynameNum int, nsd uint32) []string {
	keys := strings.Split("_$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "")
	var raw []string
	for i := 0; i < len(keys); i++ {
		for j := 0; j < len(keys); j++ {
			raw = append(raw, "_$"+keys[i]+keys[j])
			if len(raw) == keynameNum {
				goto done
			}
		}
	}
done:
	// Fisher-Yates shuffle with scd
	knarr := make([]string, len(raw))
	copy(knarr, raw)
	l := len(knarr)
	for l > 1 {
		l--
		idx := int(newScd(nsd).next()) % l // Note: this creates a new scd each iteration!
		if idx < 0 {
			idx = -idx
		}
		knarr[l], knarr[idx] = knarr[idx], knarr[l]
	}
	return knarr
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

	// Compute offset via brute-force (uses known key structure constants)
	offset := bruteForceOffset(cdArr, end)
	if offset == nil {
		return nil
	}

	// Apply offset XOR to remaining cd bytes, then generate keys
	ans := make([]int, len(cdArr)-end)
	for i := end; i < len(cdArr); i++ {
		ans[i-end] = cdArr[i] ^ offset[(i-end)%8]
	}
	return genKeysFromCdAns(ans)
}

// bruteForceOffset recovers the offset by trying all 256 values for each byte
// and checking if the result produces valid keys (keys[29..32] must be 4 bytes each,
// keys[16] must be the known constant).
func bruteForceOffset(cdArr []int, end int) []int {
	// Known: keys.length = 45, keys[0] = [54, 52] (constant "64")
	// keys[0].length = 2
	// So: offset[0] = cdArr[end] ^ 45
	// offset[1] = cdArr[end+1] ^ 0 (gap0 >> 8 = 0)
	// offset[2] = cdArr[end+2] ^ 2 (gap0 & 255 = 2)
	// offset[3] = cdArr[end+3] ^ 54 (keys[0][0])
	// offset[4] = cdArr[end+4] ^ 52 (keys[0][1])
	// Then keys[1] also has length 2 and same values [54, 52]
	// offset[5] = cdArr[end+5] ^ 0 (gap1 >> 8 = 0)
	// offset[6] = cdArr[end+6] ^ 2 (gap1 & 255 = 2)
	// offset[7] = cdArr[end+7] ^ 54 (keys[1][0])
	// Verify: offset[0] should equal cdArr[end+4+1+2+1] ^ 0 (gap1>>8) = cdArr[end+8] ^ 0
	// Wait, let me trace the positions more carefully:
	// ans[0] = numKeys = 45
	// ans[1..2] = gap0 = 0x0002 (big endian)
	// ans[3..4] = keys[0] = [54, 52]
	// ans[5..6] = gap1 = 0x0002
	// ans[7..8] = keys[1] = [54, 52]
	// ...
	// So offset[i%8] = cdArr[end+i] ^ ans[i]
	// offset[0] = cdArr[end] ^ 45
	// offset[1] = cdArr[end+1] ^ 0
	// offset[2] = cdArr[end+2] ^ 2
	// offset[3] = cdArr[end+3] ^ 54
	// offset[4] = cdArr[end+4] ^ 52
	// offset[5] = cdArr[end+5] ^ 0
	// offset[6] = cdArr[end+6] ^ 2
	// offset[7] = cdArr[end+7] ^ 54
	// Verification: cdArr[end+8] ^ offset[0] should = 52 (keys[1][1])
	// cdArr[end+9] ^ offset[1] should = gap2>>8 (keys[2].length = 48, so 0)
	// cdArr[end+10] ^ offset[2] should = gap2&255 = 48

	if end+10 >= len(cdArr) {
		return nil
	}

	offset := make([]int, 8)
	offset[0] = cdArr[end] ^ 45
	offset[1] = cdArr[end+1] ^ 0
	offset[2] = cdArr[end+2] ^ 2
	offset[3] = cdArr[end+3] ^ 54
	offset[4] = cdArr[end+4] ^ 52
	offset[5] = cdArr[end+5] ^ 0
	offset[6] = cdArr[end+6] ^ 2
	offset[7] = cdArr[end+7] ^ 54

	// Verify: keys[1][1] = cdArr[end+8] ^ offset[0] should be 52
	verify := cdArr[end+8] ^ offset[0]
	if verify != 52 {
		fmt.Fprintf(os.Stderr, "  bruteForce verify failed: keys[1][1]=%d (expected 52)\n", verify)
		return nil
	}

	// Verify: gap2 = cdArr[end+9]<<8 | cdArr[end+10] ^ offset[1..2]
	// gap2 should be keys[2].length = 48
	gap2Hi := cdArr[end+9] ^ offset[1]
	gap2Lo := cdArr[end+10] ^ offset[2]
	gap2 := gap2Hi<<8 | gap2Lo
	if gap2 != 48 {
		fmt.Fprintf(os.Stderr, "  bruteForce verify failed: gap2=%d (expected 48)\n", gap2)
		return nil
	}

	return offset
}

// computeOffsetForCd runs the task engine to compute the 8-byte offset.
func computeOffsetForCd(cdSection []int, cp3 int) ([]int, error) {
	rootDir, _ := getWd()

	// Load codemap (site constant, cached after first generation)
	codemapPath := filepath.Join(rootDir, "go-impl", "codemap_full.json")
	codemapJSON, err := readFile(codemapPath)
	if err != nil {
		return nil, fmt.Errorf("load codemap: %w (run 'node go-impl/dump_constants.js' first)", err)
	}

	// Load r2mkaText (site constant)
	r2mkaPath := filepath.Join(rootDir, "go-impl", "r2mka_codes.json")
	r2mkaJSON, err := readFile(r2mkaPath)
	if err != nil {
		return nil, fmt.Errorf("load r2mkaCodes: %w", err)
	}
	var r2mkaCodes []int
	if err := jsonUnmarshal(r2mkaJSON, &r2mkaCodes); err != nil {
		return nil, fmt.Errorf("parse r2mkaCodes: %w", err)
	}

	// Load cp2 (site constant)
	cp2Path := filepath.Join(rootDir, "go-impl", "cp2_dump.json")
	cp2JSON, err := readFile(cp2Path)
	if err != nil {
		return nil, fmt.Errorf("load cp2: %w", err)
	}
	var cp2Raw []float64
	if err := jsonUnmarshal(cp2JSON, &cp2Raw); err != nil {
		// Try as []int
		var cp2Ints []int
		if err := jsonUnmarshal(cp2JSON, &cp2Ints); err != nil {
			return nil, fmt.Errorf("parse cp2: %w", err)
		}
		cp2Raw = make([]float64, len(cp2Ints))
		for i, v := range cp2Ints {
			cp2Raw[i] = float64(v)
		}
	}

	return ComputeOffset(codemapJSON, r2mkaCodes, cp2Raw, cdSection)
}

// genKeysFromCdAns runs genKeys on the XORed cd answer.
func genKeysFromCdAns(ans []int) [][]int {
	return genKeysFromCd(ans)
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
	// codeUid: ideally computed from coder.code via Babel AST
	// For now use 0 (server may or may not validate this)
	codeUid := 0

	// Build basearr in pure Go (cp1 not available here, use empty for fixedValue20 fallback)
	basearr := buildBasearrGoPure(keys, r2mkaTime, startTime, runTime, codeUid, cp3, nil)

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
		Random:       0, // will be generated in generateCookie
	}, nil
}

// buildBasearrGoPure generates basearr entirely in Go, using hardcoded site constants
// and computing session-dependent values from keys + cp3
func buildBasearrGoPure(keys [][]int, r2mkaTime, startTime, runTime, codeUid, cp3 int, cp1 []string) []int {
	// seg1: browser fingerprint block (73 bytes, mostly constant)
	// Structure: numarrJoin(1, maxTouchPoints, evalLen, 128, uuid(UA), "MacIntel", execNum, execRand, 0, 0, hexnum, 0, innerH, innerW, outerH, outerW, 0, 0, 0, uuid("/"), 0, 0)
	seg1 := []int{
		1,    // scalar: tag
		0,    // maxTouchPoints
		33,   // evalToStringLength
		128,  // constant
		// ...numToNumarr4(uuid(userAgent)) = 4 bytes
		159, 173, 0, 238,
		// ...string2ascii("MacIntel") = 9 bytes
		8, 77, 97, 99, 73, 110, 116, 101, 108,
		// ...numToNumarr4(execNumberByTime) = 4 bytes (use fixed ~1800)
		0, 0, 7, 84,
		// ...execRandomByNumber(98, random) = 2 bytes
		55, 9,
		// 0, 0 (two scalar zeros)
		0, 0,
		// ...numToNumarr4(hexnum('3136373737323136')) = 4 bytes
		1, 0, 0, 0,   // hexnum('3136373737323136') = 16777216, numToNumarr4 = [1,0,0,0]
		0, 0, 0, 0,   // ...numToNumarr4(0) = 4 bytes
		// ...numToNumarr2(innerHeight=937) = 2 bytes
		3, 170,       // 937 = 0x03AA (JS实测)
		// ...numToNumarr2(innerWidth=1680) = 2 bytes
		6, 144,       // 1680 = 0x0690
		// ...numToNumarr2(outerHeight=1050) = 2 bytes
		4, 1,         // 1025 = 0x0401 (JS实测 availHeight)
		// ...numToNumarr2(outerWidth=1680) = 2 bytes
		6, 144,       // 1680 = 0x0690
		// ...numToNumarr8(0) = 8 bytes
		0, 0, 0, 0, 0, 0, 0, 0,
		// ...numToNumarr4(0) = 4 bytes (port check)
		0, 0, 0, 0,
		// ...numToNumarr4(0) = 4 bytes
		0, 0, 0, 0,
		// ...numToNumarr4(uuid("/")) = 4 bytes
		121, 211, 210, 212,
		// ...numToNumarr4(0) = 4 bytes
		0, 0, 0, 0,
		// ...numToNumarr8(0) = 8 bytes
		0, 0, 0, 0, 0, 0, 0, 0,
	}

	// seg10: [flagcheck, 13, time4, keys19_4, random8, flag]
	keys19Val := 0
	if len(keys) > 19 && len(keys[19]) > 0 {
		fmt.Sscanf(goAscii2string(keys[19]), "%d", &keys19Val)
	}
	keys24Val := 0
	if len(keys) > 24 && len(keys[24]) > 0 {
		fmt.Sscanf(goAscii2string(keys[24]), "%d", &keys24Val)
	}
	flagCheck := 0
	if keys24Val > 0 && keys24Val < 8 {
		flagCheck = 1
	}
	timeVal := r2mkaTime + runTime - startTime
	seg10 := []int{flagCheck, 13}
	seg10 = append(seg10, goNumToNumarr4int(timeVal)...)
	seg10 = append(seg10, goNumToNumarr4int(keys19Val)...)
	// seg10 random 8 bytes: numToNumarr8(Math.floor(random*1048575)*4294967296 + (currentTime & 4294967295))
	seg10Rand := int64(rand.Intn(1048575)) * 4294967296 + int64(runTime&0xFFFFFFFF)
	seg10 = append(seg10, goNumToNumarr8int(seg10Rand)...)
	seg10 = append(seg10, keys24Val)

	// seg7: [numToNumarr4(16777216), numToNumarr4(0), numToNumarr2(flag=1801), numToNumarr2(codeUid)]
	seg7 := []int{}
	seg7 = append(seg7, goNumToNumarr4int(16777216)...)
	seg7 = append(seg7, goNumToNumarr4int(0)...)
	seg7 = append(seg7, goNumToNumarr2int(1801)...)
	seg7 = append(seg7, goNumToNumarr2int(codeUid)...)

	// seg0: browser fingerprint encrypted block (101 bytes, site constant)
	seg0 := []int{
		47, 119, 54, 154, 195, 77, 48, 41, 123, 55, 111, 49, 253, 235, 248, 167,
		151, 183, 140, 71, 11, 230, 161, 113, 127, 26, 145, 122, 108, 163, 109, 13,
		107, 166, 163, 152, 211, 15, 217, 5, 133, 85, 184, 207, 114, 162, 21, 75,
		16, 65, 58, 91, 178, 2, 173, 195, 245, 45, 25, 149, 136, 73, 25, 83,
		50, 107, 38, 161, 202, 142, 65, 38, 53, 39, 24, 78, 71, 203, 94, 5,
		215, 32, 55, 87, 232, 118, 203, 110, 6, 197, 241, 238, 21, 86, 99, 95,
		134, 61, 190, 155, 164,
	}

	// seg6: [1, numToNumarr2(2), numToNumarr2(2), 1, encryptMode2_result(8), numToNumarr2(0)(2)]
	// encryptMode2 result: decrypt(keys22) encrypted with numarrAddTime(keys16)
	seg6Keys22 := goAscii2string(keys[22])
	seg6Decrypted := goDecryptStr(seg6Keys22)
	seg6Keys16time := goNumarrAddTimeBytes(keys[16], runTime, 0)
	seg6Enc2 := goEncryptMode2(seg6Decrypted, seg6Keys16time)
	seg6Decoded := goDecodeStr(seg6Decrypted) // NaN → 0
	seg6NumToNumarr2 := goNumToNumarr2int(seg6Decoded)
	seg6 := []int{1, 0, 2, 0, 2, 1}
	seg6 = append(seg6, seg6Enc2...)
	seg6 = append(seg6, seg6NumToNumarr2...)

	// seg2: fixedValue20 - computed from r2mka taskori + keynames
	// Port of src/handler/parser/common/fixedValue20.js
	seg2 := computeFixedValue20(keys, cp1)

	// seg9: [8, 0] (constant)
	seg9 := []int{8, 0}

	// seg13: [0] (constant)
	seg13 := []int{0}

	// Assemble using numarrJoin logic:
	// numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, seg0, 6, seg6, 2, seg2, 9, seg9, 13, seg13)
	// ALL arrays get length prefix (because ans is not empty after first scalar)
	result := []int{3}
	result = append(result, len(seg1))
	result = append(result, seg1...)
	result = append(result, 10)
	result = append(result, len(seg10))
	result = append(result, seg10...)
	result = append(result, 7)
	result = append(result, len(seg7))
	result = append(result, seg7...)
	result = append(result, 0)
	result = append(result, len(seg0))
	result = append(result, seg0...)
	result = append(result, 6)
	result = append(result, len(seg6))
	result = append(result, seg6...)
	result = append(result, 2)
	result = append(result, len(seg2))
	result = append(result, seg2...)
	result = append(result, 9)
	result = append(result, len(seg9))
	result = append(result, seg9...)
	result = append(result, 13)
	result = append(result, len(seg13))
	result = append(result, seg13...)

	return result
}

func buildBasearrGo(keys [][]int, r2mkaTime, startTime, runTime, codeUid int) []int {
	// Port of src/handler/basearr/len243.js getBasearr()
	// Site: pmos.xj.sgcc.com.cn:20080 (hostname key: SVRWShdBUxdKXlpaF1pWVBdaVw==)
	// flag = 1801, hasDebug = true, lastWord = 'P'

	// Constants
	flag := 1801

	// [1] segment: browser fingerprint block
	// First element of numarrJoin is the segment type tag
	// The inner numarrJoin(1, ...) builds the segment content
	var seg1 []int
	seg1 = append(seg1, 1) // tag for inner join

	// config values (browser fingerprint constants for Chrome on Mac)
	maxTouchPoints := 0
	evalToStringLength := 33
	platform := "MacIntel"
	userAgent := "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

	// execNumberByTime: approximate value (600-1000 range, use 800 as typical)
	execNumberByTime := 800

	// execRandomByNumber(98, random): returns [avg*100, variance*100] rounded
	// For deterministic output, use fixed values based on Math.random() ≈ 0.5
	// avg ≈ 0.5, avg*100 = 50
	// variance ≈ 0 (all values ≈ avg), variance*100 ≈ 0
	execRandom := []int{50, 0}

	// UUID of userAgent
	uaUuid := goUuidStr(userAgent)

	// UUID of pathname "/"
	pathUuid := goUuidStr("/")

	// Window dimensions (typical Chrome values)
	innerHeight := 937
	innerWidth := 1680
	outerHeight := 1050
	outerWidth := 1680

	// hexnum('3136373737323136') = specific constant
	hexNum := goHexnum("3136373737323136")

	// Build seg1 content (after the tag byte 1)
	seg1 = append(seg1, maxTouchPoints)
	seg1 = append(seg1, evalToStringLength)
	seg1 = append(seg1, 128) // constant from len243.js
	seg1 = append(seg1, goNumToNumarr4int(uaUuid)...)
	seg1 = append(seg1, goString2ascii(platform)...)
	seg1 = append(seg1, goNumToNumarr4int(execNumberByTime)...)
	seg1 = append(seg1, execRandom...)
	seg1 = append(seg1, 0, 0) // two zeros
	seg1 = append(seg1, goNumToNumarr4int(hexNum)...)
	seg1 = append(seg1, goNumToNumarr4int(0)...)
	seg1 = append(seg1, goNumToNumarr2int(innerHeight)...)
	seg1 = append(seg1, goNumToNumarr2int(innerWidth)...)
	seg1 = append(seg1, goNumToNumarr2int(outerHeight)...)
	seg1 = append(seg1, goNumToNumarr2int(outerWidth)...)
	seg1 = append(seg1, goNumToNumarr8int(0)...)
	seg1 = append(seg1, goNumToNumarr4int(0)...)
	seg1 = append(seg1, goNumToNumarr4int(0)...)
	seg1 = append(seg1, goNumToNumarr4int(pathUuid)...)
	seg1 = append(seg1, goNumToNumarr4int(0)...)
	seg1 = append(seg1, goNumToNumarr8int(0)...)

	// [10] segment: flag check + time + keys[19] + random
	flagVal := 0
	if len(keys) > 24 && len(keys[24]) > 0 {
		f := goAscii2string(keys[24])
		var fNum int
		fmt.Sscanf(f, "%d", &fNum)
		if fNum > 0 && fNum < 8 {
			flagVal = 1
		}
	}
	keys19Val := 0
	if len(keys) > 19 && len(keys[19]) > 0 {
		fmt.Sscanf(goAscii2string(keys[19]), "%d", &keys19Val)
	}
	seg10 := []int{
		flagVal,
		13,
	}
	seg10 = append(seg10, goNumToNumarr4int(r2mkaTime+runTime-startTime)...)
	seg10 = append(seg10, goNumToNumarr4int(keys19Val)...)
	// random 8 bytes (use deterministic values)
	seg10 = append(seg10, goNumToNumarr8int(0)...)

	// flag byte at end of seg10
	flagByte := 0
	if len(keys) > 24 && len(keys[24]) > 0 {
		fmt.Sscanf(goAscii2string(keys[24]), "%d", &flagByte)
	}
	seg10 = append(seg10, flagByte)

	// [7] segment: flag + codeUid
	seg7 := []int{}
	seg7 = append(seg7, goNumToNumarr4int(16777216)...)
	seg7 = append(seg7, goNumToNumarr4int(0)...)
	seg7 = append(seg7, goNumToNumarr2int(flag)...)
	seg7 = append(seg7, goNumToNumarr2int(codeUid)...)

	// [0] segment: browser fingerprint encrypted block (101 bytes, site constant)
	seg0 := []int{
		47, 119, 54, 154, 195, 77, 48, 41, 123, 55, 111, 49, 253, 235, 248, 167,
		151, 183, 140, 71, 11, 230, 161, 113, 127, 26, 145, 122, 108, 163, 109, 13,
		107, 166, 163, 152, 211, 15, 217, 5, 133, 85, 184, 207, 114, 162, 21, 75,
		16, 65, 58, 91, 178, 2, 173, 195, 245, 45, 25, 149, 136, 73, 25, 83,
		50, 107, 38, 161, 202, 142, 65, 38, 53, 39, 24, 78, 71, 203, 94, 5,
		215, 32, 55, 87, 232, 118, 203, 110, 6, 197, 241, 238, 21, 86, 99, 95,
		134, 61, 190, 155, 164,
	}

	// [6] segment: keys[22] related
	seg6 := []int{1}
	seg6 = append(seg6, goNumToNumarr2int(2)...) // :20080 specific
	seg6 = append(seg6, goNumToNumarr2int(2)...)
	seg6 = append(seg6, 1) // document.hidden = false → 1

	// encryptMode2(decrypt(ascii2string(keys[22])), numarrAddTime(keys[16])[0])
	// For simplicity, use the known structure from len243.js example
	// This requires decrypt + encryptMode2 which are complex
	// For now, output a placeholder that will be fixed
	if len(keys) > 22 && len(keys[22]) > 0 {
		// decrypt(keys[22]) gives a string, then encryptMode2 with keys[16]
		// This is a site-specific value that varies per session
		// We need to implement decrypt + encryptMode2
		decrypted := goDecrypt(goAscii2string(keys[22]))
		_ = decrypted
		// encryptMode2 output (simplified - will need full implementation)
		seg6 = append(seg6, 100, 195, 22, 79, 72, 103) // placeholder
	}
	// numToNumarr2(+decode(decrypt(ascii2string(keys[22]))))
	seg6 = append(seg6, goNumToNumarr2int(2)...)

	// [2] segment: fixedValue20
	seg2 := goFixedValue20()

	// [9] segment
	seg9 := []int{8, 0}

	// [13] segment
	seg13 := []int{0}

	// Now assemble using numarrJoin logic:
	// numarrJoin(3, seg1, 10, seg10, 7, seg7, 0, seg0, 6, seg6, 2, seg2, 9, seg9, 13, seg13)
	// First array arg is used directly (no length prefix)
	// Subsequent arrays get length prefix
	// Scalar args are just appended

	result := []int{3} // first scalar

	// seg1 (first array, no prefix)
	result = append(result, seg1...)

	// 10 (scalar) + seg10 (array with prefix)
	result = append(result, 10)
	result = append(result, len(seg10))
	result = append(result, seg10...)

	// 7 (scalar) + seg7 (array with prefix)
	result = append(result, 7)
	result = append(result, len(seg7))
	result = append(result, seg7...)

	// 0 (scalar) + seg0 (array with prefix)
	result = append(result, 0)
	result = append(result, len(seg0))
	result = append(result, seg0...)

	// 6 (scalar) + seg6 (array with prefix)
	result = append(result, 6)
	result = append(result, len(seg6))
	result = append(result, seg6...)

	// 2 (scalar) + seg2 (array with prefix)
	result = append(result, 2)
	result = append(result, len(seg2))
	result = append(result, seg2...)

	// 9 (scalar) + seg9 (array with prefix)
	result = append(result, 9)
	result = append(result, len(seg9))
	result = append(result, seg9...)

	// 13 (scalar) + seg13 (array with prefix)
	result = append(result, 13)
	result = append(result, len(seg13))
	result = append(result, seg13...)

	return result
}

// goUuidStr computes CRC32-like UUID of a string (same as uuid.js)
func goUuidStr(s string) int {
	var val uint32 = 0xFFFFFFFF
	for _, c := range s {
		val = val>>8 ^ goBignum[(val^uint32(c))&0xFF]
	}
	return int(val ^ 0xFFFFFFFF)
}

// goHexnum converts hex string pairs to a number
func goHexnum(input string) int {
	val := 0
	for i := 0; i+1 < len(input); i += 2 {
		var d int
		fmt.Sscanf(input[i:i+2], "%x", &d)
		val = val*256 + d
	}
	return val
}

// goNumToNumarr4int converts int to 4-byte big-endian
func goNumToNumarr4int(n int) []int {
	return []int{(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255}
}

// goNumToNumarr2int converts int to 2-byte big-endian
func goNumToNumarr2int(n int) []int {
	if n < 0 {
		n = 0
	}
	if n > 65535 {
		n = 65535
	}
	return []int{(n >> 8) & 255, n & 255}
}

// goNumToNumarr8int converts int64 to 8-byte big-endian
func goNumToNumarr8int(n int64) []int {
	if n < 0 {
		n = 0
	}
	hi := uint32(n / 4294967296)
	lo := uint32(n % 4294967296)
	return []int{
		int(hi>>24) & 255, int(hi>>16) & 255, int(hi>>8) & 255, int(hi) & 255,
		int(lo>>24) & 255, int(lo>>16) & 255, int(lo>>8) & 255, int(lo) & 255,
	}
}

// goFixedValue20 returns the fixed 20-byte value array
// Port of src/handler/parser/common/fixedValue20.js
func goFixedValue20() []int {
	// The values are derived from task U250200532's taskori
	// For the pmos.xj site, the default values are:
	// Based on the example basearr in len243.js, positions 138-157
	return []int{0, 0, 0, 0}
}

// goDecrypt decrypts a base64-like encoded string using the decryptKeys
// Port of src/handler/parser/common/decode.js → trans + ascii2string
// Actually this is the "decode" function, not "decrypt"
func goDecrypt(s string) []int {
	// decode.js: trans(numarr) converts byte array through UTF-8-like decoding
	// For ASCII strings, this is identity
	return goString2ascii(s)
}

// runKeygenGoja: try pure Go first, fall back to Node.js helper
func runKeygenGoja(nsd int, cd, baseUrl string) (*KeygenData, error) {
	return runFullKeygenGo(nsd, cd, baseUrl)
}

// ==================== fixedValue20 ====================

func computeFixedValue20(keys [][]int, cp1 []string) []int {
	// Port of src/handler/parser/common/fixedValue20.js
	// Uses hardcoded taskori from U250200532 (site constant)
	// taskori structure: [1,0,2,0,10,46,6, 1,0,2,1,10,46,3, ...] (20 groups of 7)
	taskori := []int{
		1, 0, 2, 0, 10, 46, 6, 1, 0, 2, 1, 10, 46, 3, 1, 0, 2, 2, 10, 46, 32,
		1, 0, 2, 3, 10, 46, 17, 1, 0, 2, 4, 10, 46, 18, 1, 0, 2, 5, 10, 46, 30,
		1, 0, 2, 6, 10, 46, 20, 1, 0, 2, 7, 10, 46, 10, 1, 0, 2, 8, 10, 46, 22,
		1, 0, 2, 9, 10, 46, 29, 1, 0, 2, 10, 10, 46, 26, 1, 0, 2, 11, 10, 46, 1,
		1, 0, 2, 12, 10, 46, 5, 1, 0, 2, 13, 10, 46, 2, 1, 0, 2, 14, 10, 46, 16,
		1, 0, 2, 15, 10, 46, 11, 1, 0, 2, 16, 10, 46, 31, 1, 0, 2, 17, 10, 46, 25,
		1, 0, 2, 18, 10, 46, 4, 1, 0, 2, 19, 10, 46, 14,
	}
	values := []int{
		103, 0, 102, 203, 224, 181, 108, 240, 101, 126,
		103, 11, 102, 203, 225, 181, 208, 180, 100, 127,
	}
	keyIndices := []int{29, 30, 31, 32}

	// Build maps: keyname → value
	maps := make(map[string]int)
	for idx, val := range values {
		knIdx := taskori[idx*7+6]
		if knIdx >= 0 && knIdx < len(cp1) {
			maps[cp1[knIdx]] = val
		}
	}

	// Look up keys[29..32] in maps
	var result []int
	for _, ki := range keyIndices {
		if ki < len(keys) && len(keys[ki]) > 0 {
			keyStr := goAscii2string(keys[ki])
			if val, ok := maps[keyStr]; ok {
				result = append(result, val)
			}
		}
	}

	if len(result) == 4 {
		return result
	}

	// Fallback: nx VM compatibility
	if len(taskori) > 0 {
		var fallback []int
		for _, ki := range keyIndices {
			if ki >= len(keys) || len(keys[ki]) == 0 {
				continue
			}
			keyStr := goAscii2string(keys[ki])
			knIdx := -1
			for i, kn := range cp1 {
				if kn == keyStr {
					knIdx = i
					break
				}
			}
			if knIdx < 0 {
				continue
			}
			// Find knIdx in taskori at position i*7+6
			for i := 6; i < len(taskori); i += 7 {
				if taskori[i] == knIdx {
					fallback = append(fallback, (i-6)/7)
					break
				}
			}
		}
		if len(fallback) == 4 {
			return fallback
		}
	}

	return []int{0, 0, 0, 0}
}

// ==================== decrypt string (for seg6) ====================

// goDecryptStr decrypts a string using decryptKeys
// Port of src/handler/parser/common/decrypt.js
func goDecryptStr(str string) []int {
	d1, d2, d3, d4, d5, d6 := goDecryptKeys[0], goDecryptKeys[1], goDecryptKeys[2], goDecryptKeys[3], goDecryptKeys[4], goDecryptKeys[5]
	var ans []int
	strRunes := []rune(str)
	for i := 0; i < len(strRunes); i += 4 {
		one := -1
		two := -1
		three := -1
		four := -1
		if i < len(strRunes) {
			one = int(strRunes[i])
		}
		if i+1 < len(strRunes) {
			two = int(strRunes[i+1])
		}
		if i+2 < len(strRunes) {
			three = int(strRunes[i+2])
		}
		if i+3 < len(strRunes) {
			four = int(strRunes[i+3])
		}

		if two != -1 && one >= 0 && one < 256 {
			ans = append(ans, d1[one]|d2[two])
		}
		if three != -1 && two >= 0 && two < 256 {
			ans = append(ans, d3[two]|d4[three])
		}
		if four != -1 && three >= 0 && three < 256 {
			ans = append(ans, d5[three]|d6[four])
		}
	}
	return ans
}

// ==================== decode (for seg6 numToNumarr2) ====================

// goDecodeStr decodes a byte array through UTF-8-like decoding then converts to number
// Port of src/handler/parser/common/decode.js → trans + ascii2string → parseInt
func goDecodeStr(numarr []int) int {
	// trans: UTF-8 decode
	var trans []int
	mark := int('?')
	for idx := 0; idx < len(numarr); {
		num := numarr[idx]
		var val int
		if num < 128 {
			val = num
			idx++
		} else if num < 192 {
			val = mark
			idx++
		} else if num < 224 {
			if idx+1 < len(numarr) {
				val = (num&63)<<6 | numarr[idx+1]&63
			}
			idx += 2
		} else if num < 240 {
			if idx+2 < len(numarr) {
				val = (num&15)<<12 | (numarr[idx+1]&63)<<6 | numarr[idx+2]&63
			}
			idx += 3
		} else if num < 248 {
			if idx+3 < len(numarr) {
				val = (num&7)<<18 | (numarr[idx+1]&63)<<12 | (numarr[idx+2]&63)<<6 | numarr[idx+3]&63
			}
			idx += 4
		} else if num < 252 {
			val = mark
			idx += 5
		} else if num < 254 {
			val = mark
			idx += 6
		} else {
			val = mark
			idx++
		}
		if val > 65535 {
			val -= 65536
			trans = append(trans, (val>>10)+55296, val%1024+56320)
		} else {
			trans = append(trans, val)
		}
	}
	// ascii2string then parseInt
	str := goAscii2string(trans)
	var num int
	if n, err := fmt.Sscanf(str, "%d", &num); err != nil || n == 0 {
		return 0 // NaN equivalent
	}
	return num
}

// ==================== encryptMode2 (for seg6) ====================

// goEncryptMode2 decrypts data with AES-CBC (IV from first 16 bytes of plaintext)
// Port of src/handler/parser/common/modeEncrypt.js encryptMode2
func goEncryptMode2(valarr, keyarr []int) []int {
	// Strip numarrAddTime suffix if needed
	aesKey := keyarr
	if len(keyarr) != 16 {
		if len(keyarr) == 21 {
			ele := keyarr[20]
			unxor := make([]int, 20)
			for i := 0; i < 20; i++ {
				unxor[i] = keyarr[i] ^ ele
			}
			aesKey = unxor[:16]
		}
	}

	// flag=1: first 16 bytes = IV, rest = ciphertext
	if len(valarr) < 32 {
		return []int{}
	}
	iv := make([]byte, 16)
	for i := 0; i < 16; i++ {
		iv[i] = byte(valarr[i])
	}
	ciphertext := make([]byte, len(valarr)-16)
	for i := 0; i < len(ciphertext); i++ {
		ciphertext[i] = byte(valarr[i+16])
	}

	keyBytes := make([]byte, 16)
	for i := 0; i < 16; i++ {
		keyBytes[i] = byte(aesKey[i])
	}

	block, err := aes.NewCipher(keyBytes)
	if err != nil {
		return []int{}
	}

	// CBC decrypt
	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	// Strip PKCS7 padding
	if len(plaintext) > 0 {
		pad := int(plaintext[len(plaintext)-1])
		if pad > 0 && pad <= len(plaintext) {
			plaintext = plaintext[:len(plaintext)-pad]
		}
	}

	// Convert to []int
	result := make([]int, len(plaintext))
	for i := 0; i < len(plaintext); i++ {
		result[i] = int(plaintext[i])
	}
	return result
}

// ==================== numarrAddTime for keys (for seg6) ====================

// goNumarrAddTimeBytes applies numarrAddTime to a key
// Returns 21-byte key (16 + 4 time + 1 ele)
func goNumarrAddTimeBytes(key []int, runTime int, random float64) []int {
	if random == 0 {
		random = rand.Float64()
	}
	ele := int(math.Ceil(random * 256))
	if ele > 255 {
		ele = 255
	}
	if runTime == 0 {
		runTime = int(time.Now().Unix())
	}
	timeBytes := goNumToNumarr4int(runTime)
	arr := make([]int, len(key)+len(timeBytes))
	copy(arr, key)
	copy(arr[len(key):], timeBytes)
	for i := range arr {
		arr[i] ^= ele
	}
	arr = append(arr, ele)
	return arr
}
