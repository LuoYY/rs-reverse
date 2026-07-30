package main

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/binary"
	"fmt"
	"math/rand"
)

// combine4: []byte -> []uint32 (big-endian)
func combine4(data []byte) []uint32 {
	n := len(data) / 4
	out := make([]uint32, n)
	for i := 0; i < n; i++ {
		out[i] = binary.BigEndian.Uint32(data[i*4:])
	}
	return out
}

// numToNumarr4: []uint32 -> []byte (big-endian)
func numToNumarr4(nums []uint32) []byte {
	out := make([]byte, len(nums)*4)
	for i, v := range nums {
		binary.BigEndian.PutUint32(out[i*4:], v)
	}
	return out
}

// numToNumarr4Single: uint32 -> []byte
func u32bytes(v uint32) []byte {
	return []byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)}
}

// xorBytes: XOR first 16 bytes of data with key, rest unchanged (matching JS xor(data, key, 16))
func xorBytes(data, key []byte) []byte {
	out := make([]byte, len(data))
	copy(out, data)
	for i := 0; i < 16 && i < len(data); i++ {
		out[i] = data[i] ^ key[i]
	}
	return out
}

// uuid (CRC32-like hash, matching JS uuid.js)
func uuid(data []byte) uint32 {
	var val uint32 = 0xFFFFFFFF
	for _, b := range data {
		val = val>>8 ^ crc32Table[(val^uint32(b))&0xFF]
	}
	return val ^ 0xFFFFFFFF // JS: (val ^ -1) >>> 0
}

var crc32Table [256]uint32

func init() {
	for i := 0; i < 256; i++ {
		item := uint32(i)
		for j := 0; j < 8; j++ {
			if item&1 != 0 {
				item = 3988292384 ^ item>>1
			} else {
				item = item >> 1
			}
		}
		crc32Table[i] = item
	}
}

// encryptMode1: AES-CBC encryption with optional IV
// flag=1: prepend 16-byte random IV
// flag=0: no IV
func encryptMode1(valarr, key []byte, flag bool) []byte {
	block, err := aes.NewCipher(key)
	if err != nil {
		panic(err)
	}

	// PKCS7 padding
	fill := 16 - len(valarr)%16
	padded := make([]byte, len(valarr)+fill)
	copy(padded, valarr)
	for i := len(valarr); i < len(padded); i++ {
		padded[i] = byte(fill)
	}

	var iv []byte
	if flag {
		iv = make([]byte, 16)
		for i := 0; i < 4; i++ {
			binary.BigEndian.PutUint32(iv[i*4:], rand.Uint32())
		}
	} else {
		iv = make([]byte, 16) // zero IV for flag=0
	}

	// CBC encrypt
	mode := cipher.NewCBCEncrypter(block, iv)
	encrypted := make([]byte, len(padded))
	mode.CryptBlocks(encrypted, padded)

	if flag {
		return append(iv, encrypted...)
	}
	return encrypted
}

// numarrJoin: join with length-prefix encoding for arrays
// Matches JS: first array arg becomes initial ans (no prefix), subsequent arrays get length prefix
func numarrJoin(items ...interface{}) []byte {
	var ans []byte
	first := true
	for _, item := range items {
		switch v := item.(type) {
		case nil:
			continue
		case byte:
			ans = append(ans, v)
		case int:
			ans = append(ans, byte(v))
		case []byte:
			if first {
				// First array: use directly, no length prefix (JS: ans.length===0 ? it)
				ans = append(ans, v...)
			} else {
				// Subsequent arrays: prepend length
				ans = append(ans, byte(len(v)))
				ans = append(ans, v...)
			}
		default:
			panic(fmt.Sprintf("numarrJoin: unsupported type %T", item))
		}
		first = false
	}
	return ans
}

// numarr2string: base64-like encoding with custom alphabet
func numarr2string(data []byte, keys string) string {
	if keys == "" {
		keys = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	}
	keyChars := []byte(keys)

	var ans []byte
	idx := 0
	for idx < len(data)-2 {
		one, two, three := data[idx], data[idx+1], data[idx+2]
		idx += 3
		ans = append(ans,
			keyChars[one>>2],
			keyChars[(one&3)<<4|two>>4],
			keyChars[(two&15)<<2|three>>6],
			keyChars[three&63],
		)
	}
	if idx < len(data) {
		b0 := data[idx]
		var b1 byte
		if idx+1 < len(data) {
			b1 = data[idx+1]
		}
		ans = append(ans, keyChars[b0>>2])
		ans = append(ans, keyChars[(b0&3)<<4|b1>>4]) // FIXED: use b0 not b1
		if idx+1 < len(data) {
			ans = append(ans, keyChars[(b1&15)<<2])
		}
	}
	return string(ans)
}

// numToNumarr2: uint16 -> [2]byte
func numToNumarr2(num int) []byte {
	if num < 0 {
		num = 0
	}
	return []byte{byte(num >> 8 & 255), byte(num & 255)}
}
