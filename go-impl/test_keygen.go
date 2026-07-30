package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
)

func testCdDecryption() {
	fmt.Println("=== Pure Go cd decryption test ===")

	nsd, cd, _, err := fetchChallenge()
	if err != nil {
		fmt.Println("Failed to fetch challenge:", err)
		os.Exit(1)
	}
	fmt.Printf("nsd=%d cd_len=%d\n", nsd, len(cd))

	// Get cp3 via Coder (no goja needed)
	rootDir, _ := os.Getwd()
	outerJs, _ := os.ReadFile(rootDir + "/example/pmos.xj.sgcc.com.cn/kmOJZ0KVxJ0R/rGTR1U4jJCVr.303c6e9.js")
	data, err := RunCoderFull(nsd, cd, string(outerJs), 0)
	if err != nil {
		fmt.Printf("RunCoderFull error: %v\n", err)
		os.Exit(1)
	}
	cp3 := data.R2mkaTime // not cp3, need to get from coder
	_ = cp3

	// Use the data from RunCoderFull directly
	fmt.Printf("Go keys count: %d\n", len(data.Keys16))
	fmt.Printf("Go keys16: %v\n", data.Keys16)
	fmt.Printf("Go keys17: %v\n", data.Keys17)

	// Get Node.js reference
	tsJSON := fmt.Sprintf(`{"nsd":%d,"cd":%q,"from":"https://pmos.xj.sgcc.com.cn:20080/"}`, nsd, cd)
	os.WriteFile("/tmp/go-test-ts.json", []byte(tsJSON), 0644)
	cmd := exec.Command("node", rootDir+"/go-impl/keygen_helper.js", "/tmp/go-test-ts.json")
	cmd.Env = append(os.Environ(), "NODE_TLS_REJECT_UNAUTHORIZED=0", "NODE_OPTIONS=--dns-result-order=ipv4first")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err = cmd.Run()
	if err != nil {
		fmt.Printf("Node.js helper error: %v\nstderr: %s\n", err, stderr.String())
		os.Exit(1)
	}

	var ref KeygenData
	json.Unmarshal(stdout.Bytes(), &ref)
	fmt.Printf("\nNode keys16: %v\n", ref.Keys16)
	fmt.Printf("Node keys17: %v\n", ref.Keys17)

	// Compare
	k16Match := bytesEqual(toBytes(data.Keys16), toBytes(ref.Keys16))
	k17Match := bytesEqual(toBytes(data.Keys17), toBytes(ref.Keys17))
	k2Match := bytesEqual(toBytes(data.Keys2), toBytes(ref.Keys2))
	fmt.Printf("\n=== keys16 match: %v, keys17 match: %v, keys2 match: %v ===\n", k16Match, k17Match, k2Match)
}
