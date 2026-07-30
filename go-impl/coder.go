package main

import (
	"encoding/json"
	"fmt"
	"math"
	"path/filepath"
	"time"
	"os"
	"sort"
	"strings"
	
)

// ==================== Coder Go Port ====================
//
// Direct port of src/handler/Coder.js + helpers.
// The Coder is a TEXT GENERATOR (not AST parser) that produces
// deobfuscated JS code from site constants (globalText) + keynames (cp[1]).

// ---- getScd (PRNG) ----

type Scd struct {
	scd int
}

func NewScd(seed int) *Scd {
	return &Scd{scd: seed}
}

func (s *Scd) Next() int {
	s.scd = 15679*(s.scd&65535) + 2531011
	return s.scd
}

// ---- arraySwap (Fisher-Yates shuffle) ----

func arraySwap(arr [][2]int, scd *Scd) [][2]int {
	knarr := make([][2]int, len(arr))
	copy(knarr, arr)
	for length := len(knarr) - 1; length >= 1; length-- {
		idx := scd.Next() % length
		knarr[length], knarr[idx] = knarr[idx], knarr[length]
	}
	return knarr
}

func arraySwapInts(arr []int, scd *Scd) []int {
	knarr := make([]int, len(arr))
	copy(knarr, arr)
	for length := len(knarr) - 1; length >= 1; length-- {
		idx := scd.Next() % length
		knarr[length], knarr[idx] = knarr[idx], knarr[length]
	}
	return knarr
}

// ---- grenKeys ----

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

func grenKeysShuffled(num int, nsd int) []string {
	keynames := grenKeys(num)
	scd := NewScd(nsd)
	return arraySwapStrings(keynames, scd)
}

func arraySwapStrings(arr []string, scd *Scd) []string {
	knarr := make([]string, len(arr))
	copy(knarr, arr)
	for length := len(knarr) - 1; length >= 1; length-- {
		idx := scd.Next() % length
		knarr[length], knarr[idx] = knarr[idx], knarr[length]
	}
	return knarr
}

// ---- globaltext (cursor-based reader) ----
// Uses []rune for JS-compatible charCodeAt behavior

type GlobalText struct {
	runes  []rune
	cursor int
}

func NewGlobalText(cursor int, text string) *GlobalText {
	return &GlobalText{runes: []rune(text), cursor: cursor}
}

func (g *GlobalText) GetCode() int {
	c := int(g.runes[g.cursor])
	g.cursor++
	return c
}

func (g *GlobalText) GetCurr(step int) int {
	g.cursor += step
	return g.cursor
}

func (g *GlobalText) GetList() ([]int, int) {
	length := int(g.runes[g.cursor])
	data := make([]int, length)
	for i := 0; i < length; i++ {
		data[i] = int(g.runes[g.cursor+1+i])
	}
	oldCursor := g.cursor
	g.cursor += length + 1
	return data, oldCursor
}

func (g *GlobalText) GetLine(nextCursor int) string {
	if g.cursor+nextCursor > len(g.runes) {
		nextCursor = len(g.runes) - g.cursor
	}
	if nextCursor <= 0 {
		return ""
	}
	data := string(g.runes[g.cursor : g.cursor+nextCursor])
	g.cursor += nextCursor
	return data
}

func (g *GlobalText) Init(cursor int, text string) {
	if cursor >= 0 {
		g.cursor = cursor
	}
	if text != "" {
		g.runes = []rune(text)
	}
}

// ---- dataOper ----

type DataOper struct {
	data map[string]interface{}
}

func NewDataOper() *DataOper {
	return &DataOper{data: make(map[string]interface{})}
}

func (d *DataOper) Init(defData map[string]interface{}) {
	if defData != nil {
		d.data = make(map[string]interface{})
		for k, v := range defData {
			d.data[k] = v
		}
	} else {
		d.data = make(map[string]interface{})
	}
}

func (d *DataOper) SetData(key string, val interface{}) {
	d.data[key] = val
}

func (d *DataOper) GetData(key string) interface{} {
	return d.data[key]
}

// ---- mateOper ----

type MateOper struct {
	mate    map[string]string
	mateOri map[string]int
	optext  *GlobalText
	keynames []string
}

func NewMateOper(keynames []string, optext *GlobalText) *MateOper {
	m := &MateOper{
		mate:    make(map[string]string),
		mateOri: make(map[string]int),
		optext:  optext,
		keynames: keynames,
	}
	return m
}

func (m *MateOper) Init() {
	m.mate = make(map[string]string)
	m.mateOri = make(map[string]int)
}

func (m *MateOper) SetMate(key string, isNotCover bool) {
	if key == "" {
		key = "UNSET"
	}
	ori := m.optext.GetCode()
	if isNotCover && key != "UNSET" {
		if _, ok := m.mateOri[key]; ok {
			panic(fmt.Sprintf("关键词键%s重复定义", key))
		}
	}
	m.mateOri[key] = ori
	if ori >= 0 && ori < len(m.keynames) {
		m.mate[key] = m.keynames[ori]
	} else {
		m.mate[key] = fmt.Sprintf("_$ERR%d", ori)
	}
}

func (m *MateOper) GetMate(key string) string {
	return m.mate[key]
}

func (m *MateOper) GetMateOri(key string) int {
	return m.mateOri[key]
}

// ---- Coder ----

type FunctionEntry struct {
	Name    string `json:"name"`
	Current int    `json:"current"`
	Code    string `json:"code"`
}

type Coder struct {
	Ts               *TsData
	scd                *Scd
	keynames           []string
	keycodes           []string
	optext             *GlobalText
	opmate             *MateOper
	opdata             *DataOper
	r2mkaText          string
	immucfg            *ImmuCfg
	FunctionsNameSort  []FunctionEntry
	mainFunctionIdx    []int
	code               string
	codePure           string
	config             CoderConfig
	debuggerScd        func(int) bool
	debuggerPosi       []int
	startTime          int64
}

type TsData struct {
	Nsd  int      `json:"nsd"`
	Cd   string   `json:"cd"`
	Cp   []interface{} `json:"cp"`
	Aebi  [][]int  `json:"aebi"`
	Scj   []interface{} `json:"scj"`
}

type ImmuCfg struct {
	GlobalText1 string `json:"globalText1"`
	GlobalText2 string `json:"globalText2"`
	Cp0         string `json:"cp0"`
	Cp2         []int  `json:"cp2"`
	GlobalText3 string `json:"globalText3"`
}

type CoderConfig struct {
	HasDebug  bool
	HasCodemap bool
}

func NewCoder(nsd int, cd string, immucfg *ImmuCfg, keynameNum int) *Coder {
	c := &Coder{
		immucfg: immucfg,
		config:  CoderConfig{HasDebug: false, HasCodemap: true},
	}
	// Build Ts
	c.keynames = grenKeysShuffled(keynameNum, nsd)
	c.Ts = &TsData{
		Nsd: nsd,
		Cd:  cd,
		Cp:  make([]interface{}, 10),
		Aebi: [][]int{},
	}
	c.Ts.Cp[0] = immucfg.Cp0
	c.Ts.Cp[1] = c.keynames
	c.Ts.Cp[2] = immucfg.Cp2
	c.scd = NewScd(nsd)
	c.opdata = NewDataOper()
	return c
}

func (c *Coder) Run() *Coder {
	c.startTime = 0 // will use 0 for deterministic output
	var codeArr []string
	codeArr = c.parseGlobalText1(codeArr)
	codeArr = append(codeArr, c.parseGlobalText2())
	codeArr = append(codeArr, "})(", "$_ts", ".scj,", "$_ts", ".aebi);")

	// Build code and codePure
	for i, s := range codeArr {
		c.code += s
		if c.debuggerPosi == nil || !containsInt(c.debuggerPosi, i) {
			c.codePure += s
		}
	}

	// parseTs: compute cp[3]
	flag := 0
	for i := 0; i < len(c.code); i += 100 {
		flag += int(c.code[i])
	}
	c.Ts.Cp[3] = flag

	return c
}

func containsInt(arr []int, v int) bool {
	for _, x := range arr {
		if x == v {
			return true
		}
	}
	return false
}

func (c *Coder) parseGlobalText2() string {
	c.optext = NewGlobalText(0, c.immucfg.GlobalText2)
	c.opdata.Init(nil)
	c.opmate = NewMateOper(c.keynames, c.optext)
	c.opmate.SetMate("G_$ht", true)

	keycodes := strings.Split(c.optext.GetLine(c.optext.GetCode()), string(rune(257)))
	list, _ := c.optext.GetList()
	return strings.Join(c.special(list, keycodes, c.keynames), "")
}

func (c *Coder) special(list []int, keycodes, keynames []string) []string {
	var ans []string
	for i := 0; i < len(list)-1; i += 2 {
		ans = append(ans, keycodes[list[i]], keynames[list[i+1]])
	}
	ans = append(ans, keycodes[list[len(list)-1]])
	return ans
}

func (c *Coder) parseGlobalText1(codeArr []string) []string {
	c.optext = NewGlobalText(0, c.immucfg.GlobalText1)
	c.opdata.Init(map[string]interface{}{
		"arr8": []int{4, 16, 64, 256, 1024, 4096, 16384, 65536},
	})
	c.opmate = NewMateOper(c.keynames, c.optext)
	c.opmate.SetMate("G_$e4", true)
	c.opmate.SetMate("G_$$c", true)
	c.opmate.SetMate("G_$dK", true)
	c.opmate.SetMate("G_$kv", true)
	c.opmate.SetMate("G_$cR", true)
	c.opmate.SetMate("", false)

	// keycodes
	line1Len := c.optext.GetCode()*55295 + c.optext.GetCode()
	line1 := c.optext.GetLine(line1Len)
	c.keycodes = append(c.keycodes, strings.Split(line1, string(rune(257)))...)
	c.opmate.SetMate("", false)
	r2mkaText := c.optext.GetLine(c.optext.GetCode()*55295 + c.optext.GetCode())
	c.keycodes = append(c.keycodes, r2mkaText)
	c.r2mkaText = c.parseR2mka(r2mkaText)
	c.opmate.SetMate("G_code_num", false)
	codeNum := c.opmate.GetMateOri("G_code_num")
	for i := 0; i < codeNum; i++ {
		c.gren(i, &codeArr)
	}

	// closing braces
	closingBraces := "}}}}}}}}}}"
	excess := c.opmate.GetMateOri("G_code_num") - 1
	if excess < 0 {
		excess = 0
	}
	if excess > len(closingBraces) {
		excess = len(closingBraces)
	}
	codeArr = append(codeArr, closingBraces[excess:])

	// mainFunctionIdx end
	totalLen := 0
	for _, s := range codeArr {
		totalLen += len(s)
	}
	c.mainFunctionIdx = append(c.mainFunctionIdx, totalLen)

	return codeArr
}

func (c *Coder) parseR2mka(text string) string {
	start := strings.Index(text, "\"")
	if start < 0 {
		return text
	}
	start++
	end := strings.LastIndex(text, "\"")
	if end < 2 {
		return text
	}
	end -= 2
	if start > end {
		return ""
	}
	return jsUnescape(text[start : end+1])
}

// jsUnescape: Port of utils/unescape.js
// JS: JSON.parse('"' + text + '"') which handles all JSON escape sequences
// Go: manual implementation of JSON string unescaping
func jsUnescape(s string) string {
	var result []rune
	runes := []rune(s)
	for i := 0; i < len(runes); i++ {
		if runes[i] == '\\' && i+1 < len(runes) {
			i++
			switch runes[i] {
			case 'n':
				result = append(result, '\n')
			case 'r':
				result = append(result, '\r')
			case 't':
				result = append(result, '\t')
			case 'b':
				result = append(result, '\b')
			case 'f':
				result = append(result, '\f')
			case '"':
				result = append(result, '"')
			case '\\':
				result = append(result, '\\')
			case '/':
				result = append(result, '/')
			case 'u':
				// \uXXXX - 4 hex digits
				if i+4 < len(runes) {
					var val int
					for j := 1; j <= 4; j++ {
						c := runes[i+j]
						var d int
						switch {
						case c >= '0' && c <= '9':
							d = int(c - '0')
						case c >= 'a' && c <= 'f':
							d = int(c-'a') + 10
						case c >= 'A' && c <= 'F':
							d = int(c-'A') + 10
						default:
							d = -1
						}
						if d < 0 {
							break
						}
						val = val*16 + d
					}
					result = append(result, rune(val))
					i += 4
				}
			case 'x':
				// \xNN - 2 hex digits (non-standard but used in JS)
				if i+2 < len(runes) {
					var val int
					for j := 1; j <= 2; j++ {
						c := runes[i+j]
						var d int
						switch {
						case c >= '0' && c <= '9':
							d = int(c - '0')
						case c >= 'a' && c <= 'f':
							d = int(c-'a') + 10
						case c >= 'A' && c <= 'F':
							d = int(c-'A') + 10
						default:
							d = -1
						}
						if d < 0 {
							break
						}
						val = val*16 + d
					}
					result = append(result, rune(val))
					i += 2
				}
			default:
				// Unknown escape: keep the character as-is
				result = append(result, runes[i])
			}
		} else {
			result = append(result, runes[i])
		}
	}
	return string(result)
}

func (c *Coder) gren(current int, codeArr *[]string) {
	codeFirst := "\n\n\n\n\n"
	n := c.scd.Next() % 5
	*codeArr = append(*codeArr, codeFirst[:n])

	c.opmate.SetMate("_$ku", false)
	c.opmate.SetMate("_$$6", false)
	c.opmate.SetMate("_$b$", false)
	c.opmate.SetMate("_$$q", false)
	c.opmate.SetMate("_$jw", false)
	c.opmate.SetMate("_$$g", false)
	c.opmate.SetMate("_$cu", false)
	c.opmate.SetMate("_$aw", false)

	dataK, _ := c.optext.GetList()
	c.opdata.SetData("_$_K", dataK)
	dataH, _ := c.optext.GetList()
	c.opdata.SetData("_$$H", dataH)
	dataC, _ := c.optext.GetList()
	c.opdata.SetData("_$_C", dataC)

	// arr2two: pair up _$_C data
	dataCArr := dataC
	var arr2two [][2]int
	for i := 0; i+1 < len(dataCArr); i += 2 {
		arr2two = append(arr2two, [2]int{dataCArr[i], dataCArr[i+1]})
	}

	// arraySwap(arr2two, scd)
	swapped := arraySwap(arr2two, c.scd)
	c.opdata.SetData("_$$w", swapped)

	c.opmate.SetMate("_$bf", false)
	dataG, _ := c.optext.GetList()
	c.opdata.SetData("_$g$", dataG)

	// aebi
	aebi := dataG
	if len(c.Ts.Aebi) <= current {
		// Extend aebi
		for len(c.Ts.Aebi) <= current {
			c.Ts.Aebi = append(c.Ts.Aebi, nil)
		}
	}
	c.Ts.Aebi[current] = aebi

	c.opmate.SetMate("_$e4", false)
	e4Count := c.opmate.GetMateOri("_$e4")
	// func2: get e4Count lists
	var cSData [][]int
	for i := 0; i < e4Count; i++ {
		list, _ := c.optext.GetList()
		cSData = append(cSData, list)
	}
	c.opdata.SetData("_$cS", arraySwap2D(cSData, c.scd))

	c.opmate.SetMate("_$$c", false)
	cCount := c.opmate.GetMateOri("_$$c")
	var kData [][]int
	for i := 0; i < cCount; i++ {
		list, _ := c.optext.GetList()
		kData = append(kData, list)
	}
	c.opdata.SetData("_$$k", kData)

	if current > 0 {
		if len(c.mainFunctionIdx) == 0 {
			// mainFunctionIdx start
			totalLen := 0
			for _, s := range *codeArr {
				totalLen += len(s)
			}
			c.mainFunctionIdx = []int{totalLen}
		}
		*codeArr = append(*codeArr, "function ", c.opmate.GetMate("_$jw"), "(", c.opmate.GetMate("_$$6"))
		for _, it := range dataK {
			*codeArr = append(*codeArr, ",", c.keynames[it])
		}
		*codeArr = append(*codeArr, "){")
	} else {
		*codeArr = append(*codeArr, "(function(", c.opmate.GetMate("G_$dK"), ",", c.opmate.GetMate("G_$kv"), "){var ", c.opmate.GetMate("_$$6"), "=0;")
	}

	// functionsNameMap
	wData := swapped // opdata.getData('_$$w')
	functionsNameMap := make(map[string]string)
	for _, pair := range wData {
		key1 := pair[0]
		key2 := pair[1]
		name := c.keynames[key1]
		varName := c.opmate.GetMate("_$$q")
		inner := c.opmate.GetMate("_$$g")
		fnCode := "function " + name + "(){var " + varName + "=[" + fmt.Sprintf("%d", key2) + "];Array.prototype.push.apply(" + varName + ",arguments);return " + inner + ".apply(this," + varName + ");}"
		*codeArr = append(*codeArr, fnCode)
		functionsNameMap[name] = fnCode
	}

	// _$cS data
	cSDataSwapped := c.opdata.GetData("_$cS").([][]int)
	for _, item := range cSDataSwapped {
		for i := 0; i < len(item)-1; i += 2 {
			*codeArr = append(*codeArr, c.keycodes[item[i]], c.keynames[item[i+1]])
		}
		if len(item) > 0 {
			*codeArr = append(*codeArr, c.keycodes[item[len(item)-1]])
		}
	}

	// _$$H data
	hData := c.opdata.GetData("_$$H").([]int)
	if len(hData) > 0 {
		for idx, it := range hData {
			if idx > 0 {
				*codeArr = append(*codeArr, ",")
			} else {
				*codeArr = append(*codeArr, "var ")
			}
			*codeArr = append(*codeArr, c.keynames[it])
		}
		*codeArr = append(*codeArr, ";")
	}

	*codeArr = append(*codeArr, "var ", c.opmate.GetMate("_$b$"), ",", c.opmate.GetMate("_$cu"), ",", c.opmate.GetMate("_$ku"), "=")
	*codeArr = append(*codeArr, c.opmate.GetMate("_$$6"), ",", c.opmate.GetMate("_$aw"), "=", c.opmate.GetMate("G_$kv"), "[", fmt.Sprintf("%d", current), "];")
	*codeArr = append(*codeArr, "while(1){", c.opmate.GetMate("_$cu"), "=", c.opmate.GetMate("_$aw"), "[", c.opmate.GetMate("_$ku"), "++];")
	*codeArr = append(*codeArr, "if(", c.opmate.GetMate("_$cu"), "<", fmt.Sprintf("%d", c.opmate.GetMateOri("_$bf")), "){")

	// functionsSort
	if current >= 1 && current <= 4 {
		func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Fprintf(os.Stderr, "  [coder] functionsSort(%d) failed: %v\n", current, r)
				}
			}()
			c.functionsSort(current, functionsNameMap)
		}()
	}

	// grenIfelse
	c.grenIfelse(0, c.opmate.GetMateOri("_$bf"), codeArr)

	*codeArr = append(*codeArr, "}else ", ";", "}")
}

func arraySwap2D(arr [][]int, scd *Scd) [][]int {
	knarr := make([][]int, len(arr))
	copy(knarr, arr)
	for length := len(knarr) - 1; length >= 1; length-- {
		idx := scd.Next() % length
		knarr[length], knarr[idx] = knarr[idx], knarr[length]
	}
	return knarr
}

func (c *Coder) functionsSort(current int, functionsNameMap map[string]string) {
	wData := c.opdata.GetData("_$$w").([][2]int)
	length := len(wData)
	aebi := c.Ts.Aebi[current]
	kData := c.opdata.GetData("_$$k").([][]int)

	// tryGetName returns name and ok flag (no panic)
	tryGetName := func(idx int) (string, bool) {
		if idx < 0 || idx >= len(kData) {
			return "", false
		}
		numarr := kData[idx]
		if numarr == nil || len(numarr) != 5 {
			return "", false
		}
		nameIdx := numarr[3]
		if nameIdx < 0 || nameIdx >= len(c.keynames) {
			return "", false
		}
		name := c.keynames[nameIdx]
		if _, ok := functionsNameMap[name]; !ok {
			return "", false
		}
		return name, true
	}

	start := 0
	if current == 1 {
		for _, it := range c.keycodes {
			// Match JS regex: /^\([0-9]+\);$/
			// Pattern: (NNN);
			if len(it) < 4 || it[0] != '(' || it[len(it)-1] != ';' {
				continue
			}
			// Check it's (digits);
			inner := it[1 : len(it)-1] // remove ( and ; → should be "NNN)"
			if len(inner) < 2 || inner[len(inner)-1] != ')' {
				continue
			}
			numStr := inner[:len(inner)-1] // remove ) → should be "NNN"
			if len(numStr) == 0 {
				continue
			}
			allDigits := true
			for _, ch := range numStr {
				if ch < '0' || ch > '9' {
					allDigits = false
					break
				}
			}
			if !allDigits {
				continue
			}
			var s int
			fmt.Sscanf(numStr, "%d", &s)
			if s+length > len(aebi) {
				continue
			}
			// Check all indices are valid
			allValid := true
			for i := s; i < s+length; i++ {
				_, ok := tryGetName(aebi[i])
				if !ok {
					allValid = false
					break
				}
			}
			if allValid {
				start = s
			}
		}
	}

	// Populate functionsNameSort from start
	for i := start; i < start+length && i < len(aebi); i++ {
		name, ok := tryGetName(aebi[i])
		if !ok {
			continue
		}
		c.FunctionsNameSort = append(c.FunctionsNameSort, FunctionEntry{
			Name:    name,
			Current: current,
			Code:    functionsNameMap[name],
		})
	}
}

func (c *Coder) grenIfelse(start, end int, codeArr *[]string) {
	arr8 := []int{4, 16, 64, 256, 1024, 4096, 16384, 65536}
	diff := end - start
	if diff == 0 {
		return
	} else if diff == 1 {
		c.grenIfElseAssign(start, codeArr)
	} else if diff <= 4 {
		text := "if("
		end--
		for start < end {
			*codeArr = append(*codeArr, text, c.opmate.GetMate("_$cu"), "===", fmt.Sprintf("%d", start), "){")
			c.grenIfElseAssign(start, codeArr)
			text = "}else if("
			start++
		}
		*codeArr = append(*codeArr, "}else{")
		c.grenIfElseAssign(start, codeArr)
		*codeArr = append(*codeArr, "}")
	} else {
		step := 0
		for i, a := range arr8 {
			if diff <= a {
				if i > 0 {
					step = arr8[i-1]
				}
				break
			}
		}
		text := "if("
		for start+step < end {
			*codeArr = append(*codeArr, text, c.opmate.GetMate("_$cu"), "<", fmt.Sprintf("%d", start+step), "){")
			c.grenIfelse(start, start+step, codeArr)
			text = "}else if("
			start += step
		}
		*codeArr = append(*codeArr, "}else{")
		c.grenIfelse(start, end, codeArr)
		*codeArr = append(*codeArr, "}")
	}
}

func (c *Coder) grenIfElseAssign(start int, codeArr *[]string) {
	kData := c.opdata.GetData("_$$k").([][]int)
	if start >= len(kData) {
		return
	}
	arr := kData[start]
	if arr == nil {
		return
	}
	l := len(arr) - (len(arr) % 2)
	for i := 0; i < l; i += 2 {
		*codeArr = append(*codeArr, c.keycodes[arr[i]], c.keynames[arr[i+1]])
	}
	if len(arr) != l {
		*codeArr = append(*codeArr, c.keycodes[arr[l]])
	}
}

// ---- getImmucfg (load from pre-extracted JSON files) ----

type ImmuCfgRaw struct {
	GlobalText1 string
	GlobalText2 string
	Cp0         string
	Cp2         []int
}

func getImmucfg(jscode string) (*ImmuCfgRaw, error) {
	// Extract the 4 longest quoted strings from the outer JS
	// This matches the JS getImmucfg logic
	var quotes [][2]int
	inQuote := false
	quoteStart := 0
	for i := 0; i < len(jscode); i++ {
		if jscode[i] == '"' && (i == 0 || jscode[i-1] != '\\') {
			if !inQuote {
				inQuote = true
				quoteStart = i
			} else {
				inQuote = false
				quotes = append(quotes, [2]int{quoteStart, i})
			}
		}
	}

	type strEntry struct {
		s   string
		len int
	}
	var entries []strEntry
	for _, q := range quotes {
		s := jsUnescape(jscode[q[0]+1 : q[1]])
		entries = append(entries, strEntry{s: s, len: len([]rune(s))})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].len > entries[j].len
	})

	if len(entries) < 4 {
		return nil, fmt.Errorf("not enough quoted strings found: %d", len(entries))
	}

	cp2Str := entries[2].s
	var cp2 []int
	for _, c := range cp2Str {
		cp2 = append(cp2, int(c))
	}

	return &ImmuCfgRaw{
		GlobalText1: entries[0].s,
		GlobalText2: entries[3].s,
		Cp0:         entries[1].s,
		Cp2:         cp2,
	}, nil
}

// loadImmucfgFromFiles loads pre-extracted immucfg from JSON files.
// This is more reliable than parsing the outer JS at runtime.
func loadImmucfgFromFiles(dir string) (*ImmuCfgRaw, error) {
	gt1Bytes, err := readFile(dir + "/globaltext1.json")
	if err != nil {
		return nil, fmt.Errorf("load globaltext1: %w", err)
	}
	var gt1 string
	if err := json.Unmarshal(gt1Bytes, &gt1); err != nil {
		return nil, err
	}

	gt2Bytes, err := readFile(dir + "/globaltext2.json")
	if err != nil {
		return nil, fmt.Errorf("load globaltext2: %w", err)
	}
	var gt2 string
	if err := json.Unmarshal(gt2Bytes, &gt2); err != nil {
		return nil, err
	}

	cp0Bytes, err := readFile(dir + "/cp0.json")
	if err != nil {
		return nil, fmt.Errorf("load cp0: %w", err)
	}
	var cp0 string
	if err := json.Unmarshal(cp0Bytes, &cp0); err != nil {
		return nil, err
	}

	cp2Bytes, err := readFile(dir + "/cp2.json")
	if err != nil {
		return nil, fmt.Errorf("load cp2: %w", err)
	}
	var cp2 []int
	if err := json.Unmarshal(cp2Bytes, &cp2); err != nil {
		return nil, err
	}

	return &ImmuCfgRaw{
		GlobalText1: gt1,
		GlobalText2: gt2,
		Cp0:         cp0,
		Cp2:         cp2,
	}, nil
}

// ---- ComputeCodeUid ----

// ComputeCodeUid computes the codeUid from the Coder output.
// codeUid = (uuid(funcCode) ^ uuid(sliceCode)) & 65535
func ComputeCodeUid(c *Coder, keys33, keys34 int) int {
	mainFnCode := ""
	if len(c.mainFunctionIdx) >= 2 {
		mainFnCode = c.code[c.mainFunctionIdx[0]:c.mainFunctionIdx[1]]
	}

	funcIdx := keys33
	validIdx := funcIdx
	if validIdx >= len(c.FunctionsNameSort) {
		validIdx = 20
	}

	var funcCode string
	if validIdx < len(c.FunctionsNameSort) {
		funcCode = c.FunctionsNameSort[validIdx].Code
	} else {
		funcCode = mainFnCode[:100]
	}

	mainFnLen := len(mainFnCode)
	sliceLen := mainFnLen / 100
	sliceStart := sliceLen * keys34

	var sliceCode string
	if sliceStart+sliceLen <= mainFnLen {
		sliceCode = mainFnCode[sliceStart : sliceStart+sliceLen]
	}

	uid1 := uuidString(funcCode)
	uid2 := uuidString(sliceCode)
	return int((uid1 ^ uid2) & 65535)
}

// uuidString computes CRC32-like hash of a string
func uuidString(s string) uint32 {
	var val uint32 = 0xFFFFFFFF
	for i := 0; i < len(s); i++ {
		val = val>>8 ^ crc32Table[(val^uint32(s[i]))&0xFF]
	}
	return val ^ 0xFFFFFFFF
}

// ---- Full keygen without Node.js ----

// RunCoderFull runs the complete Coder pipeline and returns all keygen data.
func RunCoderFull(nsd int, cd, outerJsCode string, cp3Override int) (*KeygenData, error) {
	rootDir, _ := getWd()
	
	// 1. Load immucfg from pre-extracted JSON files (more reliable)
	immuRaw, err := loadImmucfgFromFiles(filepath.Join(rootDir, "go-impl"))
	if err != nil {
		// Fallback: extract from outer JS
		immuRaw, err = getImmucfg(outerJsCode)
		if err != nil {
			return nil, fmt.Errorf("getImmucfg: %w", err)
		}
	}
	immucfg := &ImmuCfg{
		GlobalText1: immuRaw.GlobalText1,
		GlobalText2: immuRaw.GlobalText2,
		Cp0:         immuRaw.Cp0,
		Cp2:         immuRaw.Cp2,
	}

	// 2. Detect keynameNum from outer JS
	keynameNum := 909 // site constant for pmos.xj:20080

	// 3. Run Coder
	coder := NewCoder(nsd, cd, immucfg, keynameNum)
	coder.Run()

	// 4. Get cp3 - prefer goja's cp3Override (correct), fallback to Coder's cp3
	cp3 := cp3Override
	if cp3 == 0 {
		cp3 = coder.Ts.Cp[3].(int)
	}

	// 5. Initialize const data (required for decryptCd)
	basestr := "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	initConstData(basestr)

	// 6. Parse cd to get keys using cp3
	keys := parseCdToKeys(cd, cp3)
	if keys == nil {
		return nil, fmt.Errorf("parseCdToKeys failed")
	}

	// 5. Compute codeUid
	keys33 := 0
	if len(keys) > 33 && len(keys[33]) > 0 {
		fmt.Sscanf(goAscii2string(keys[33]), "%d", &keys33)
	}
	keys34 := 0
	if len(keys) > 34 && len(keys[34]) > 0 {
		fmt.Sscanf(goAscii2string(keys[34]), "%d", &keys34)
	}
	codeUid := ComputeCodeUid(coder, keys33, keys34)
	r2mkaTime := 0
	if len(keys) > 21 && len(keys[21]) > 0 {
		fmt.Sscanf(goAscii2string(keys[21]), "%d", &r2mkaTime)
	}
	now := time.Now()
	runTime := int(now.Unix())
	startTime := runTime - 1

	basearr := buildBasearrGoPure(keys, r2mkaTime, startTime, runTime, codeUid, cp3, coder.keynames)

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
		Random:       0,
	}, nil
}


// Suppress unused import errors
var (
	_ = math.Floor
	_ = json.Marshal
	_ = os.Getenv
	_ = sort.Sort
)
