// nx_main.go — nx 站点纯 Go 算法验证
// 用 nx 的 immucfg + keynameNum=1151 跑 Coder → cp3 → parseCdToKeys
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// runNxCoder 用 nx 站点常量跑 Coder + parseCdToKeys
func runNxCoder(nsd int, cd string) (*KeygenData, error) {
	rootDir, _ := os.Getwd()

	// 1. 加载 nx immucfg（当前目录即 go-impl，或上级）
	cfgDir := filepath.Join(rootDir, "go-impl")
	if _, err := os.Stat(cfgDir); err != nil {
		cfgDir = rootDir
	}
	immuRaw, err := loadImmucfgFromFilesNx(cfgDir)
	if err != nil {
		return nil, fmt.Errorf("load nx immucfg: %w", err)
	}
	immucfg := &ImmuCfg{
		GlobalText1: immuRaw.GlobalText1,
		GlobalText2: immuRaw.GlobalText2,
		Cp0:         immuRaw.Cp0,
		Cp2:         immuRaw.Cp2,
	}

	// 2. nx keynameNum = 1151（已确认）
	coder := NewCoder(nsd, cd, immucfg, 1151)
	coder.Run()
	cp3 := coder.Ts.Cp[3].(int)
	fmt.Printf("[nx coder] cp3=%d codeLen=%d aebi=%d\n", cp3, len(coder.code), len(coder.Ts.Aebi))

	// 3. 初始化 constData
	// ★ nx cd 解码用 cdBasestr（'-' 在索引 43，与普通 basestr 的 '.' 不同）——len243-nx.js adapt.cdBasestr
	cdBasestr := "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,.;=?@[]^"
	basestr := "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj-7zXBaSnu0TC6gy_4Ze5d{"
	initConstData(cdBasestr)
	fmt.Printf("[nx basestr] cdBasestr len=%d basestr(cookie编码) len=%d\n", len(cdBasestr), len(basestr))

	// 4. parseCdToKeys（用 TaskEngine 计算 offset，需要 nx codemap/r2mka/cp2）
	cdArr := decryptCd(cd)
	end := (cdArr[0]<<8 | cdArr[1]) + 2
	one := make([]int, end-2)
	copy(one, cdArr[2:end])
	parseCdSection(one, cp3)

	// 加载 nx codemap/r2mka/cp2
	codemapPath := filepath.Join(cfgDir, "nx_codemap.json")
	codemapJSON, err := os.ReadFile(codemapPath)
	if err != nil {
		return nil, fmt.Errorf("load nx codemap: %w", err)
	}
	r2mkaPath := filepath.Join(cfgDir, "nx_r2mka_codes.json")
	r2mkaJSON, err := os.ReadFile(r2mkaPath)
	if err != nil {
		return nil, fmt.Errorf("load nx r2mka: %w", err)
	}
	var r2mkaCodes []int
	if err := json.Unmarshal(r2mkaJSON, &r2mkaCodes); err != nil {
		return nil, fmt.Errorf("parse r2mka: %w", err)
	}
	cp2Path := filepath.Join(cfgDir, "nx_cp2_parsed.json")
	cp2JSON, err := os.ReadFile(cp2Path)
	if err != nil {
		return nil, fmt.Errorf("load nx cp2: %w", err)
	}
	var cp2Raw []float64
	if err := json.Unmarshal(cp2JSON, &cp2Raw); err != nil {
		var cp2Ints []int
		if err2 := json.Unmarshal(cp2JSON, &cp2Ints); err2 != nil {
			return nil, fmt.Errorf("parse cp2: %w", err2)
		}
		for _, v := range cp2Ints {
			cp2Raw = append(cp2Raw, float64(v))
		}
	}
	fmt.Printf("[nx cp2] len=%d\n", len(cp2Raw))

	// ★ nx offset：deriveOffset（numKeys=51, step1 varint gap）——95_nx_proxy_online.js 验证算法
	fmt.Printf("[nx debug] tail前16: %v\n", cdArr[end:end+16])
	offset := deriveOffsetNx(cdArr[end:])
	if offset == nil {
		fmt.Printf("[nx offset] deriveOffset failed, 尝试 TaskEngine\n")
		off, err := ComputeOffset(codemapJSON, r2mkaCodes, cp2Raw, one)
		if err == nil && len(off) == 8 {
			offset = off
		}
		if offset == nil {
			return nil, fmt.Errorf("offset 计算失败")
		}
	}
	fmt.Printf("[nx offset] OK: %v\n", offset)

	// 应用 offset XOR
	ans := make([]int, len(cdArr)-end)
	for i := end; i < len(cdArr); i++ {
		ans[i-end] = cdArr[i] ^ offset[(i-end)%8]
	}
	keys := genKeysNx(ans)
	if keys == nil {
		return nil, fmt.Errorf("genKeysNx failed")
	}
	fmt.Printf("[nx keys] count=%d keys[0]=%v keys[2].len=%d keys[16].len=%d keys[17].len=%d\n",
		len(keys), keys[0], len(keys[2]), len(keys[16]), len(keys[17]))
	fmt.Printf("[nx debug] tail[20:25]=%v (XOR前)\n", cdArr[end+20:end+25])
	fmt.Printf("[nx debug] ans[7:25]=%v\n", ans[7:25])
	fmt.Printf("[nx debug] keys[2]=%v\n", keys[2])

	return &KeygenData{
		Keys2:     keys[2],
		Keys16:    keys[16],
		Keys17:    keys[17],
		Basestr:   basestr,
		CodeUid:   0,
	}, nil
}

// getLensGoNx: varint 长度解码（95_nx_proxy_online.js getLensGo 移植）
func getLensGoNx(numarr []int, idx int) (int, int) {
	item := numarr[idx]
	idx++
	var lens int
	if item&128 == 0 {
		lens = item
	} else if item&192 == 128 {
		lens = ((item & 63) << 8) | numarr[idx]
		idx++
	} else if item&224 == 192 {
		lens = ((item & 31) << 16) | (numarr[idx] << 8) | numarr[idx+1]
		idx += 2
	} else if item&240 == 224 {
		lens = ((item & 15) << 24) | (numarr[idx] << 16) | (numarr[idx+1] << 8) | numarr[idx+2]
		idx += 3
	} else if item&248 == 240 {
		lens = (numarr[idx] << 24) | (numarr[idx+1] << 16) | (numarr[idx+2] << 8) | numarr[idx+3]
		idx += 4
	} else {
		lens = item
	}
	return lens, idx
}

// genKeysNx: step1 varint gap 解析 keys（95_nx_proxy_online.js genKeysSim 移植）
func genKeysNx(ans []int) [][]int {
	keys := [][]int{}
	op := 1
	for i := 0; i < ans[0]; i++ {
		var gap int
		if op+1 >= len(ans) {
			return nil
		}
		gap, op = getLensGoNx(ans, op)
		if gap < 0 || op+gap > len(ans) {
			return nil
		}
		keys = append(keys, ans[op:op+gap])
		op += gap
	}
	return keys
}

// deriveOffsetNx: K16 锚扫描推导 offset（numKeys=51, step1 布局）——95_nx_proxy_online.js deriveOffset 移植
func deriveOffsetNx(tail []int) []int {
	if len(tail) < 40 {
		return nil
	}
	off0 := tail[0] ^ 51
	off1 := tail[1] ^ 2
	off4 := tail[4] ^ 2
	off7 := tail[7] ^ 48
	for k0 := 0; k0 <= 127; k0++ {
		off2 := tail[2] ^ k0
		off5 := tail[5] ^ k0
		for k1 := 0; k1 <= 127; k1++ {
			off3 := tail[3] ^ k1
			off6 := tail[6] ^ k1
			offset := []int{off0, off1, off2, off3, off4, off5, off6, off7}
			ans := make([]int, len(tail))
			for i := 0; i < len(tail); i++ {
				ans[i] = tail[i] ^ offset[i%8]
			}
			if ans[0] != 51 || ans[1] != 2 || ans[4] != 2 || ans[7] != 48 {
				continue
			}
			keys := genKeysNx(ans)
			if keys != nil && len(keys[2]) == 48 &&
				len(keys) > 32 && len(keys[29]) == 4 && len(keys[30]) == 4 && len(keys[31]) == 4 && len(keys[32]) == 4 {
				return offset
			}
		}
	}
	return nil
}

// loadImmucfgFromFilesNx 加载 nx 的 immucfg JSON 文件
func loadImmucfgFromFilesNx(dir string) (*ImmuCfgRaw, error) {
	read := func(name string) ([]byte, error) {
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		return b, nil
	}
	gt1, err := read("nx_globaltext1.json")
	if err != nil {
		return nil, err
	}
	gt2, err := read("nx_globaltext2.json")
	if err != nil {
		return nil, err
	}
	cp0, err := read("nx_cp0.json")
	if err != nil {
		return nil, err
	}
	cp2b, err := read("nx_cp2.json")
	if err != nil {
		return nil, err
	}
	var cp2 []int
	if err := json.Unmarshal(cp2b, &cp2); err != nil {
		return nil, err
	}
	var gt1s, gt2s, cp0s string
	json.Unmarshal(gt1, &gt1s)
	json.Unmarshal(gt2, &gt2s)
	json.Unmarshal(cp0, &cp0s)
	return &ImmuCfgRaw{GlobalText1: gt1s, GlobalText2: gt2s, Cp0: cp0s, Cp2: cp2}, nil
}

// nx 测试模式：./pmos_go nx <nsd> <cd>
func mainNxTest(args []string) {
	if len(args) < 2 {
		fmt.Println("usage: pmos_go nx <nsd> <cd>")
		os.Exit(1)
	}
	var nsd int
	fmt.Sscanf(args[0], "%d", &nsd)
	cd := args[1]
	data, err := runNxCoder(nsd, cd)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}
	out, _ := json.Marshal(data)
	fmt.Println(string(out))
}
