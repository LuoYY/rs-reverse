package main

import (
	"fmt"
	"math/rand"
	"strings"
	"time"
)

// ==================== 瑞数 VMP query 参数生成器（纯 Go） ====================
//
// 移植自 wb-dsv4flash/pure_query_gen.js（2026-07-31 完全破解）
//
// 算法：
//   query = '0' + numarr2string(88B, basestr)
//   88B = [CRC32(4B)][1][0][48][session_data=keys2 48B][32][request_data 32B]
//   session_data = keys[2]（48B，cd 派生，原始明文）
//   request_data = encryptMode1(plain24, queryKey21, flag=0)
//   queryKey = numarrAddTime(keys17, unixTime, random)[0]
//   plain24 = [keys2^PREFIX_MASK 8B][随机 5B][随机 3B][0xb7+随机 2B][随机 1B][CRC32(url.toUpperCase())]
//
// 站点固定掩码（跨 5 会话验证恒定，prefix[0..7] 服务器校验）
var queryPrefixMask = []byte{0x0b, 0x16, 0x00, 0x10, 0x00, 0x31, 0x00, 0x01}

// GenQuery 生成 r20SZOQm query 参数值
func GenQuery(data *KeygenData, url string) string {
	keys2 := toBytes(data.Keys2)
	keys17 := toBytes(data.Keys17)

	// queryKey = numarrAddTime(keys17, unixTime, random)[0]
	now := time.Now().Unix()
	random := rand.Float64()
	key21 := numarrAddTime(keys17, int(now), random) // 21 bytes

	// plain24（24 字节明文）
	crcUrl := uuid([]byte(strings.ToUpper(url)))
	plain24 := make([]byte, 24)
	plain24[0] = keys2[0] ^ queryPrefixMask[0]
	plain24[1] = keys2[1] ^ queryPrefixMask[1]
	plain24[2] = keys2[2] // mask=0
	plain24[3] = keys2[3] ^ queryPrefixMask[3]
	plain24[4] = keys2[4] // mask=0
	plain24[5] = keys2[5] ^ queryPrefixMask[5]
	plain24[6] = keys2[6] // mask=0
	plain24[7] = keys2[7] ^ queryPrefixMask[7]
	// bytes 8-15 随机（不校验）
	for i := 8; i < 16; i++ {
		plain24[i] = byte(rand.Intn(256))
	}
	// byte 16: 0xb7 常量 + bytes 17-19 随机
	plain24[16] = 0xb7
	plain24[17] = byte(rand.Intn(256))
	plain24[18] = byte(rand.Intn(256))
	plain24[19] = byte(rand.Intn(256))
	// bytes 20-23: CRC32(url.toUpperCase()) 服务器校验
	plain24[20] = byte(crcUrl >> 24)
	plain24[21] = byte(crcUrl >> 16)
	plain24[22] = byte(crcUrl >> 8)
	plain24[23] = byte(crcUrl)

	// request_data = encryptMode1(plain24, key21, flag=0) → 32 bytes
	requestData := encryptMode1(plain24, key21, false)

	// 88B = [crc4][1][0][48][keys2][32][requestData]
	body := make([]byte, 0, 84)
	body = append(body, 1, 0, 48)
	body = append(body, keys2...)
	body = append(body, 32)
	body = append(body, requestData...)

	crc := uuid(body)
	b88 := make([]byte, 0, 88)
	b88 = append(b88, byte(crc>>24), byte(crc>>16), byte(crc>>8), byte(crc))
	b88 = append(b88, body...)

	basestr := data.Basestr
	if basestr == "" {
		basestr = "qrcklmDoExthWJiHAp1sVYKU3RFMQw8IGfPO92bvLNj.7zXBaSnu0TC6gy_4Ze5d{}|~ !#$%()*+,-;=?@[]^"
	}

	return "0" + numarr2string(b88, basestr)
}

// GenQueryParamName 生成 query 参数名（keys[7].split(';')[1]）
func GenQueryParamName(data *KeygenData) string {
	keys7Str := goAscii2string(data.Keys7)
	parts := strings.Split(keys7Str, ";")
	if len(parts) > 1 {
		return parts[1]
	}
	return "r20SZOQm" // 兜底
}

// verify: 编译检查
var _ = fmt.Sprintf
