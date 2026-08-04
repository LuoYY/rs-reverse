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
	basestr := "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	initConstData(basestr)

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
	cp2Path := filepath.Join(cfgDir, "nx_cp2.json")
	cp2JSON, err := os.ReadFile(cp2Path)
	if err != nil {
		return nil, fmt.Errorf("load nx cp2: %w", err)
	}
	var cp2Raw []float64
	var cp2Ints []int
	if err := json.Unmarshal(cp2JSON, &cp2Raw); err != nil {
		if err2 := json.Unmarshal(cp2JSON, &cp2Ints); err2 != nil {
			return nil, fmt.Errorf("parse cp2: %w", err2)
		}
		for _, v := range cp2Ints {
			cp2Raw = append(cp2Raw, float64(v))
		}
	}

	offset, err := ComputeOffset(codemapJSON, r2mkaCodes, cp2Raw, one)
	if err != nil {
		fmt.Printf("[nx offset] TaskEngine failed: %v, 尝试 bruteForceOffset\n", err)
		offset = bruteForceOffset(cdArr, end)
		if offset == nil {
			return nil, fmt.Errorf("offset 计算失败")
		}
	} else {
		fmt.Printf("[nx offset] TaskEngine OK: %v\n", offset)
	}

	// 应用 offset XOR
	ans := make([]int, len(cdArr)-end)
	for i := end; i < len(cdArr); i++ {
		ans[i-end] = cdArr[i] ^ offset[(i-end)%8]
	}
	keys := genKeysFromCd(ans)
	if keys == nil {
		return nil, fmt.Errorf("genKeysFromCd failed")
	}
	fmt.Printf("[nx keys] count=%d keys[0]=%v keys[2].len=%d keys[16].len=%d keys[17].len=%d\n",
		len(keys), keys[0], len(keys[2]), len(keys[16]), len(keys[17]))

	return &KeygenData{
		Keys2:     keys[2],
		Keys16:    keys[16],
		Keys17:    keys[17],
		Basestr:   basestr,
		CodeUid:   0,
	}, nil
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
