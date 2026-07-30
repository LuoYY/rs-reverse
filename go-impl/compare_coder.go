package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
)

func mainCompareCoder() {
	// Load fixed session
	sessionBytes, _ := ioutil.ReadFile("/tmp/fixed_session.json")
	var session struct {
		Nsd int    `json:"nsd"`
		Cd  string `json:"cd"`
	}
	json.Unmarshal(sessionBytes, &session)
	nsd := session.Nsd
	cd := session.Cd

	rootDir, _ := os.Getwd()
	immuRaw, err := loadImmucfgFromFiles(filepath.Join(rootDir, "go-impl"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "loadImmucfg failed: %v\n", err)
		os.Exit(1)
	}

	immucfg := &ImmuCfg{
		GlobalText1: immuRaw.GlobalText1,
		GlobalText2: immuRaw.GlobalText2,
		Cp0:         immuRaw.Cp0,
		Cp2:         immuRaw.Cp2,
	}

	coder := NewCoder(nsd, cd, immucfg, 909)
	coder.Run()

	// Load JS metrics
	jsMetricsBytes, _ := ioutil.ReadFile("/tmp/js_coder_metrics.json")
	var jsMetrics struct {
		Cp3        int      `json:"cp3"`
		CodeLen    int      `json:"codeLen"`
		MainFnStart int     `json:"mainFnStart"`
		MainFnEnd  int      `json:"mainFnEnd"`
		MainFnLen  int      `json:"mainFnLen"`
		FnsCount   int      `json:"fnsCount"`
		FuncIdx    int      `json:"funcIdx"`
		ValidIdx   int      `json:"validIdx"`
		Keys34val  int      `json:"keys34val"`
		SliceLen   int      `json:"sliceLen"`
		SliceStart int      `json:"sliceStart"`
		CodeUid    int      `json:"codeUid"`
		FuncCodeLen int     `json:"funcCodeLen"`
		SliceCodeLen int    `json:"sliceCodeLen"`
		Keynames   []string `json:"keynames"`
		Keys33     int      `json:"keys33"`
		Keys34     int      `json:"keys34"`
	}
	json.Unmarshal(jsMetricsBytes, &jsMetrics)

	// Go metrics
	goCodeLen := len(coder.code)
	goMainStart := 0
	goMainEnd := 0
	if len(coder.mainFunctionIdx) >= 2 {
		goMainStart = coder.mainFunctionIdx[0]
		goMainEnd = coder.mainFunctionIdx[1]
	}
	goMainFnLen := goMainEnd - goMainStart

	fmt.Printf("=== Go vs JS Coder Comparison (nsd=%d) ===\n", nsd)
	fmt.Printf("codeLen:     Go=%d  JS=%d  diff=%d\n", goCodeLen, jsMetrics.CodeLen, goCodeLen-jsMetrics.CodeLen)
	fmt.Printf("mainFnIdx:   Go=[%d,%d]  JS=[%d,%d]\n", goMainStart, goMainEnd, jsMetrics.MainFnStart, jsMetrics.MainFnEnd)
	fmt.Printf("mainFnLen:   Go=%d  JS=%d  diff=%d\n", goMainFnLen, jsMetrics.MainFnLen, goMainFnLen-jsMetrics.MainFnLen)
	fmt.Printf("fnsCount:    Go=%d  JS=%d\n", len(coder.FunctionsNameSort), jsMetrics.FnsCount)

	// Compare keynames
	if len(coder.keynames) == len(jsMetrics.Keynames) {
		knMatch := 0
		for i := range coder.keynames {
			if coder.keynames[i] == jsMetrics.Keynames[i] {
				knMatch++
			}
		}
		fmt.Printf("keynames:    Go match=%d/%d\n", knMatch, len(coder.keynames))
	} else {
		fmt.Printf("keynames:    Go count=%d JS count=%d MISMATCH\n", len(coder.keynames), len(jsMetrics.Keynames))
	}

	// Compare codeUid
	keys33 := jsMetrics.Keys33
	keys34 := jsMetrics.Keys34
	goCodeUid := ComputeCodeUid(coder, keys33, keys34)
	fmt.Printf("codeUid:     Go=%d  JS=%d  match=%v\n", goCodeUid, jsMetrics.CodeUid, goCodeUid == jsMetrics.CodeUid)

	// Compare funcCode
	if jsMetrics.ValidIdx < len(coder.FunctionsNameSort) {
		goFuncCode := coder.FunctionsNameSort[jsMetrics.ValidIdx].Code
		fmt.Printf("funcCode:    Go len=%d JS len=%d match=%v\n", len(goFuncCode), jsMetrics.FuncCodeLen, goFuncCode == "")
	}

	// Byte-level comparison of coder.code
	jsCodeBytes, err := ioutil.ReadFile("/tmp/js_coder_code.txt")
	if err != nil {
		fmt.Printf("Cannot read JS code: %v\n", err)
		return
	}
	jsCode := string(jsCodeBytes)
	goCode := coder.code

	// Find first difference
	minLen := len(goCode)
	if len(jsCode) < minLen {
		minLen = len(jsCode)
	}
	firstDiff := -1
	for i := 0; i < minLen; i++ {
		if goCode[i] != jsCode[i] {
			firstDiff = i
			break
		}
	}

	if firstDiff < 0 {
		if len(goCode) == len(jsCode) {
			fmt.Println("\n✅ coder.code is IDENTICAL!")
		} else {
			fmt.Printf("\nCode prefix matches but lengths differ: Go=%d JS=%d\n", len(goCode), len(jsCode))
		}
	} else {
		fmt.Printf("\n❌ First difference at byte %d:\n", firstDiff)
		goCtx := goCode
		jsCtx := jsCode
		start := firstDiff - 30
		if start < 0 {
			start = 0
		}
		end := firstDiff + 50
		if end > len(goCtx) {
			end = len(goCtx)
		}
		if end > len(jsCtx) {
			end = len(jsCtx)
		}
		fmt.Printf("  Go: ...%q...\n", goCtx[start:end])
		fmt.Printf("  JS: ...%q...\n", jsCtx[start:end])

		// Count total differences
		diffCount := 0
		for i := 0; i < minLen; i++ {
			if goCode[i] != jsCode[i] {
				diffCount++
			}
		}
		fmt.Printf("  Total different bytes: %d (out of %d)\n", diffCount, minLen)

		// Find all difference regions
		regions := []struct{ start, end int }{}
		inDiff := false
		regionStart := 0
		for i := 0; i < minLen; i++ {
			if goCode[i] != jsCode[i] {
				if !inDiff {
					regionStart = i
					inDiff = true
				}
			} else {
				if inDiff {
					regions = append(regions, struct{ start, end int }{regionStart, i})
					inDiff = false
				}
			}
		}
		if inDiff {
			regions = append(regions, struct{ start, end int }{regionStart, minLen})
		}
		fmt.Printf("  Difference regions: %d\n", len(regions))
		for i, r := range regions {
			if i < 10 {
				g := goCode[r.start:r.end]
				j := jsCode[r.start:r.end]
				fmt.Printf("    [%d:%d] Go=%q JS=%q\n", r.start, r.end, g, j)
			}
		}
	}

	// Also compare mainFnCode
	if goMainStart < len(goCode) && goMainEnd <= len(goCode) && jsMetrics.MainFnStart < len(jsCode) && jsMetrics.MainFnEnd <= len(jsCode) {
		goMain := goCode[goMainStart:goMainEnd]
		jsMain := jsCode[jsMetrics.MainFnStart:jsMetrics.MainFnEnd]
		mainMinLen := len(goMain)
		if len(jsMain) < mainMinLen {
			mainMinLen = len(jsMain)
		}
		mainFirstDiff := -1
		for i := 0; i < mainMinLen; i++ {
			if goMain[i] != jsMain[i] {
				mainFirstDiff = i
				break
			}
		}
		if mainFirstDiff >= 0 {
			fmt.Printf("\nMain function first diff at offset %d:\n", mainFirstDiff)
			ms := mainFirstDiff - 30
			if ms < 0 {
				ms = 0
			}
			me := mainFirstDiff + 50
			if me > len(goMain) {
				me = len(goMain)
			}
			if me > len(jsMain) {
				me = len(jsMain)
			}
			fmt.Printf("  Go: ...%q...\n", goMain[ms:me])
			fmt.Printf("  JS: ...%q...\n", jsMain[ms:me])
		} else {
			fmt.Println("\n✅ mainFnCode is IDENTICAL!")
		}
	}

	_ = strings.Compare
}
