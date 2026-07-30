package main

// Huffman encoding - exact JS numarrEncrypt port
// JS uses float64 for curKey, converts to int32/uint32 for bitwise ops

type huffNode struct {
	total  int
	idx    int // -1 for internal nodes
	first  *huffNode
	second *huffNode
}

type huffConfig struct {
	key int32
	val int
}

var huffConfigs []huffConfig

func init() {
	tree := buildHuffmanTree()
	huffConfigs = buildHuffmanConfig(tree, 0, 0, make([]huffConfig, 0))
}

func buildHuffmanTree() *huffNode {
	var arr []*huffNode
	for i := 1; i < 255; i++ {
		arr = append(arr, &huffNode{total: 1, idx: i})
	}
	arr = append(arr, &huffNode{total: 6, idx: 255})
	arr = append(arr, &huffNode{total: 45, idx: 0})

	parse := func(item *huffNode) {
		for i, a := range arr {
			if item.total <= a.total {
				arr = append(arr, nil)
				copy(arr[i+1:], arr[i:])
				arr[i] = item
				return
			}
		}
		arr = append(arr, item)
	}

	for len(arr) > 1 {
		o := arr[0]
		t := arr[1]
		arr = arr[2:]
		node := &huffNode{total: o.total + t.total, idx: -1, first: o, second: t}
		parse(node)
	}
	return arr[0]
}

func buildHuffmanConfig(tree *huffNode, key int32, val int, arr []huffConfig) []huffConfig {
	if tree.idx == -1 {
		arr = buildHuffmanConfig(tree.first, key<<1, val+1, arr)
		arr = buildHuffmanConfig(tree.second, (key<<1)+1, val+1, arr)
	} else {
		for len(arr) <= tree.idx {
			arr = append(arr, huffConfig{})
		}
		arr[tree.idx] = huffConfig{key: key, val: val}
	}
	return arr
}

func getHuffConfig(b int) huffConfig {
	if b < len(huffConfigs) {
		return huffConfigs[b]
	}
	return huffConfig{key: 0, val: 0}
}

// toInt32: simulate JS ToInt32 conversion (float64 -> int32)
func toInt32(f float64) int32 {
	// JS ToInt32: f mod 2^32, then interpret as signed int32
	if f != f || f == 0 || f == 1e308 { // NaN, 0, Infinity
		return 0
	}
	// Use math.Mod to get f mod 2^32
	const two32 = 4294967296.0
	f = f - two32*float64(int64(f/two32))
	if f >= 2147483648.0 {
		f -= two32
	} else if f < -2147483648.0 {
		f += two32
	}
	return int32(f)
}

// toUint32: simulate JS ToUint32 conversion (float64 -> uint32)
func toUint32(f float64) uint32 {
	return uint32(toInt32(f))
}

// numarrEncrypt: Huffman encode - exact JS port using float64 curKey
func numarrEncrypt(data []byte) []byte {
	curKey := float64(0)
	curLen := 0
	var out []byte
	for _, b := range data {
		c := getHuffConfig(int(b))
		// JS: curKey = (curKey << c.val) + c.key
		// << converts curKey to int32, shifts by (c.val & 31), returns int32
		// + converts to float64
		shifted := toInt32(curKey) << uint(c.val&31)
		curKey = float64(shifted) + float64(c.key)
		curLen += c.val
		// Emit 8-bit bytes
		for curLen >= 8 {
			curLen -= 8
			// JS: (curKey >>> curLen) & 255
			u32 := toUint32(curKey) >> uint(curLen)
			out = append(out, byte(u32&255))
		}
		// JS: curKey = curKey & ((1 << curLen) - 1)
		if curLen > 0 {
			mask := int32(1)<<uint(curLen) - 1
			curKey = float64(toInt32(curKey) & mask)
		} else {
			curKey = 0
		}
	}
	// JS: if (curLen > 0) ans.push((curKey << (8 - curLen)) & 255)
	if curLen > 0 {
		shifted := toInt32(curKey) << uint(8-curLen)
		out = append(out, byte(toUint32(float64(shifted))&255))
	}
	return out
}
