package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"
)

// ==================== Task Engine for offset computation ====================
//
// The RS (瑞数) task engine is a stack-based VM that executes "taskarr" programs.
// Each taskarr is an array of opcodes + immediate arguments.
// Opcodes are defined by a "codemap" which maps opcode numbers to code strings.
//
// Key components:
// - Stack (data stack with push/pop)
// - taskarr cursor (program counter, can jump)
// - data array (separate storage)
// - ret array (return values)
// - loop_res proxy (returns child task functions or constants)
// - global_res proxy (always returns cp2)
// - commonFunc dispatcher (sets current object + key based on type code)
//
// For U14124020 (the offset task):
// - global_res always returns cp2 (fixed constant array)
// - loop_res returns child tasks for indices < child_one.length
// - Special case: offsetConst[93]=3, [94]=51, [95]=153
// - The task computes an 8-byte offset array returned as ret[5]

// Codemap holds the parsed codemap from the JS pipeline.
// The codemap structure is constant across sessions (only variable names change).
type Codemap struct {
	Params      []string `json:"params"`
	TaskAttr    []string `json:"taskAttr"`
	TaskFactory string   `json:"taskFactory"`
	Keyname     string   `json:"keyname"`
	Taskarr     string   `json:"taskarr"`
	DataKey     string   `json:"dataKey"`
	DataIdx     string   `json:"dataIdx"`
	Ret0        string   `json:"ret0"`
	Ret1        string   `json:"ret1"`
	Ret2        string   `json:"ret2"`
	Ret3        string   `json:"ret3"`
	GlobalRes   string   `json:"globalRes"`
	LoopRes     string   `json:"loopRes"`
	Forcur      string   `json:"forcur"`
	Formax      string   `json:"formax"`
	Varible     []string `json:"varible"`
	CommonFunc  string   `json:"commonFunc"`
	Name        string   `json:"name"`
	Entries     map[string]string
}

// R2mkaTask represents a node in the r2mka task tree.
type R2mkaTask struct {
	Lens     int        // parameter array length
	IsReset  int        // reset flag
	Taskstr  string     // raw task string
	Taskarr  []int      // opcodes (derived from taskstr, may be modified by getTaskarr)
	Taskori  []int      // original taskarr backup
	Key      string     // tree path key
	UID      string     // unique ID
	ChildOne []*R2mkaTask // child tasks (may have leading nils)
	ChildTwo []*R2mkaTask
	Parent   *R2mkaTask
	Val      map[string]interface{}
}

// R2mkaTree holds the parsed r2mka tree and UID lookup.
type R2mkaTree struct {
	Root   *R2mkaTask
	ByUID  map[string][]*R2mkaTask
}

// TaskEngine executes task programs using the codemap opcode semantics.
type TaskEngine struct {
	Codemap     *Codemap
	Cp2         []float64
	OffsetConst map[int]float64
	Tree        *R2mkaTree
	Debug       bool
}

// NewTaskEngine creates a task engine from codemap JSON and cp2.
func NewTaskEngine(codemapJSON []byte, cp2 []float64) (*TaskEngine, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal(codemapJSON, &raw); err != nil {
		return nil, fmt.Errorf("parse codemap JSON: %w", err)
	}

	cm := &Codemap{
		Entries: make(map[string]string),
	}

	// Extract known fields
	if v, ok := raw["params"].([]interface{}); ok {
		cm.Params = toStringSlice(v)
	}
	if v, ok := raw["taskAttr"].([]interface{}); ok {
		cm.TaskAttr = toStringSlice(v)
	}
	cm.TaskFactory = getString(raw, "taskFactory")
	cm.Keyname = getString(raw, "keyname")
	cm.Taskarr = getString(raw, "taskarr")
	cm.DataKey = getString(raw, "dataKey")
	cm.DataIdx = getString(raw, "dataIdx")
	cm.Ret0 = getString(raw, "ret0")
	cm.Ret1 = getString(raw, "ret1")
	cm.Ret2 = getString(raw, "ret2")
	cm.Ret3 = getString(raw, "ret3")
	cm.GlobalRes = getString(raw, "globalRes")
	cm.LoopRes = getString(raw, "loopRes")
	cm.Forcur = getString(raw, "forcur")
	cm.Formax = getString(raw, "formax")
	if v, ok := raw["varible"].([]interface{}); ok {
		cm.Varible = toStringSlice(v)
	}
	cm.CommonFunc = getString(raw, "commonFunc")
	cm.Name = getString(raw, "name")

	// Extract numeric opcode entries
	for k, v := range raw {
		if s, ok := v.(string); ok {
			cm.Entries[k] = s
		}
	}

	return &TaskEngine{
		Codemap:     cm,
		Cp2:         cp2,
		OffsetConst: make(map[int]float64),
	}, nil
}

// SetTree sets the r2mka task tree.
func (te *TaskEngine) SetTree(tree *R2mkaTree) {
	te.Tree = tree
}

// RunTaskByUID executes a task by UID and returns the result.
func (te *TaskEngine) RunTaskByUID(uid string, args []interface{}, taskarrOverride map[int][]int) (interface{}, error) {
	tasks, ok := te.Tree.ByUID[uid]
	if !ok || len(tasks) != 1 {
		return nil, fmt.Errorf("task %s not found or not unique (count=%d)", uid, len(tasks))
	}
	return te.RunTask(tasks[0], args, taskarrOverride)
}

// RunTask executes a single task.
func (te *TaskEngine) RunTask(task *R2mkaTask, args []interface{}, taskarrOverride map[int][]int) (interface{}, error) {
	// The loop_res proxy: for each index, returns a function that runs a child task
	// For U14124020 special case: offsetConst[idx]=3, [idx+1]=51, [idx+2]=153

	// Build the execution context
	ctx := &execContext{
		te:              te,
		task:            task,
		args:            args,
		taskarrOverride: taskarrOverride,
		offsetConst:     te.OffsetConst,
		stack:           []interface{}{},
		data:            []interface{}{},
		cursor:          0,
	}

	// ret array: [args, undefined, [window, args], parentSubTask]
	ctx.ret = []interface{}{
		args,                    // ret[0] = args
		nil,                     // ret[1] = undefined
		[]interface{}{"window", args}, // ret[2]
		te.getParentSubTask(task),     // ret[3]
	}

	// Execute the taskarr
	taskarr := task.Taskarr
	err := ctx.executeTaskarr(taskarr, 0)
	if err != nil {
		return nil, err
	}

	// Return ret[5]
	if len(ctx.ret) > 5 {
		return ctx.ret[5], nil
	}
	return nil, nil
}

func (te *TaskEngine) getParentSubTask(task *R2mkaTask) interface{} {
	// Simplified: just return a slice with loop_res equivalent
	// In the JS code, this builds [loopRes, ...subTaskEntries]
	// For U14124020, the parent subtask access is minimal
	return []interface{}{}
}

// execContext holds the execution state for a single task run.
type execContext struct {
	te              *TaskEngine
	task            *R2mkaTask
	args            []interface{}
	taskarrOverride map[int][]int
	offsetConst     map[int]float64
	stack           []interface{}
	data            []interface{}
	ret             []interface{}
	cursor          int    // taskarr cursor
	curObj          interface{} // current object (kU)
	curKey          int    // current key (k2)
}

// executeTaskarr runs the opcode sequence from start position.
func (ctx *execContext) executeTaskarr(taskarr []int, start int) error {
	ctx.cursor = start
	for ctx.cursor < len(taskarr) {
		opcode := taskarr[ctx.cursor]
		ctx.cursor++

		code, ok := ctx.te.Codemap.Entries[fmt.Sprintf("%d", opcode)]
		if !ok {
			// Skip unknown opcodes
			continue
		}

		// Execute the opcode
		if err := ctx.execOpcode(opcode, code, taskarr); err != nil {
			return err
		}
	}
	return nil
}

// execOpcode executes a single opcode.
// Instead of eval'ing the code string (which uses obfuscated variable names),
// we implement each opcode's semantics directly based on its opcode number.
func (ctx *execContext) execOpcode(opcode int, code string, taskarr []int) error {
	switch opcode {
	case 0: // |= assignment: stack[-1] = curObj[curKey] |= stack.pop()
		val := ctx.pop()
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = toInt(obj[ctx.curKey]) | toInt(val)
		ctx.push(obj[ctx.curKey])

	case 1: // push keynames[taskarr[++cursor]]
		idx := ctx.nextArg(taskarr)
		ctx.push(ctx.getKeyname(idx))

	case 2: // push bound function call result
		idx := ctx.nextArg(taskarr)
		// Simplified: push a function reference
		ctx.push(ctx.makeBoundFunc(idx))

	case 3: // += assignment: curObj[curKey] += stack.pop()
		val := ctx.pop()
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = toFloat(obj[ctx.curKey]) + toFloat(val)
		ctx.push(obj[ctx.curKey])

	case 4: // subtraction: b - a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(toFloat(b) - toFloat(a))

	case 5: // set context: curKey = taskarr[++cursor]; curObj = global_res (cp2 array)
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.te.Cp2 // global_res returns cp2

	case 6: // equality: b == a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(toFloat(b) == toFloat(a))

	case 7: // call with 1 arg from stack: curObj[curKey](stack.pop())
		ctx.stack = ctx.stack[:len(ctx.stack)-1] // peek without pop
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		result := callFunc(fn, ctx.stack[argIdx])
		ctx.stack[argIdx] = result

	case 8: // property access with remap: stack.push(stack.pop()[key])
		// taskarr[cursor] is set to 71, then key = taskarr[++cursor]
		_ = ctx.nextArg(taskarr) // skip the 71 marker
		key := ctx.nextArg(taskarr)
		// Rewrite cursor position (already consumed)
		val := ctx.pop()
		ctx.push(getProperty(val, key))

	case 9: // call method with 1 arg: curObj[curKey](stack.pop())
		argIdx := len(ctx.stack) - 1
		fn := ctx.getCurAsFunc()
		ctx.stack[argIdx] = callFunc(fn, ctx.stack[argIdx])

	case 10: // set property: curObj[curKey] = stack.pop()
		val := ctx.pop()
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = val

	case 11: // set context: curKey = taskarr[++cursor]; curObj = args (ret[0])
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.args

	case 12: // less than: b < a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(toFloat(b) < toFloat(a))

	case 13: // complex: call ew(taskItem, ...) with jump
		// This is a conditional jump / loop construct
		// _$ew(_$en, taskarr[++cursor], taskarr[++cursor], dc=taskarr[++cursor], taskarr[++cursor], cursor+1, loopRes, ret)
		// ret[4] ? cursor = h7 : cursor += dc
		arg1 := ctx.nextArg(taskarr)
		arg2 := ctx.nextArg(taskarr)
		dc := ctx.nextArg(taskarr)
		arg4 := ctx.nextArg(taskarr)
		_ = arg1
		_ = arg2
		_ = arg4
		// Check ret[4] for jump
		if len(ctx.ret) > 4 && ctx.ret[4] != nil && toFloat(ctx.ret[4]) != 0 {
			// Jump to h7 (which was set by opcode 16 or 34)
			// h7 is stored in a special location
			if h7, ok := ctx.ret[4].(int); ok {
				ctx.cursor = h7
			}
		} else {
			ctx.cursor += dc
		}

	case 14: // set context: curKey = taskarr[++cursor]; curObj = data array
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.data

	case 15: // call method with 2 args from stack
		ctx.stack = ctx.stack[:len(ctx.stack)-2]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc2(fn, ctx.stack[argIdx], ctx.stack[argIdx+1]))

	case 16: // set ret[4]=2, jump to h7
		// h7 is typically the loop start
		// This is a "continue" in the loop
		// ret[4] = 2 means "continue loop"
		// For now, this is a no-op in our simplified engine

	case 17: // push constant from iV array
		// taskarr[cursor] = 38, then key = taskarr[++cursor]
		_ = ctx.nextArg(taskarr) // skip 38 marker
		idx := ctx.nextArg(taskarr)
		ctx.push(float64(idx))

	case 18: // strict equality: b === a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(b == a)

	case 19: // call method with 0 args: curObj[curKey]()
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc(fn))

	case 20: // push true
		ctx.push(true)

	case 21: // set context: curKey = taskarr[++cursor]; curObj = keynames
		ctx.curKey = ctx.nextArg(taskarr)
		// curObj = keynames (gv.ts.cp[1])
		// For our purposes, keynames are not needed for offset computation

	case 22: // push false
		ctx.push(false)

	case 23: // call method with 2 args: curObj[curKey](stack[-2], stack[-1])
		ctx.stack = ctx.stack[:len(ctx.stack)-2]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc2(fn, ctx.stack[argIdx], ctx.stack[argIdx+1]))

	case 24: // push ret[taskarr[++cursor]][taskarr[++cursor]]
		idx1 := ctx.nextArg(taskarr)
		idx2 := ctx.nextArg(taskarr)
		if arr, ok := ctx.ret[idx1].([]interface{}); ok {
			ctx.push(arr[idx2])
		} else if arr, ok := ctx.ret[idx1].([]int); ok {
			ctx.push(float64(arr[idx2]))
		} else {
			ctx.push(nil)
		}

	case 25: // call with apply: curObj[curKey].apply(null, args_slice)
		n := ctx.nextArg(taskarr)
		args := make([]interface{}, n)
		start := len(ctx.stack) - n
		copy(args, ctx.stack[start:])
		ctx.stack = ctx.stack[:start]
		fn := ctx.getCurAsFunc()
		ctx.push(callFuncN(fn, args))

	case 26: // conditional jump: if (!stack.pop()) cursor += taskarr[++cursor]
		val := ctx.pop()
		jump := ctx.nextArg(taskarr)
		if toFloat(val) == 0 {
			ctx.cursor += jump
		}

	case 27: // property access: stack.push(stack.pop()[stack.pop()])
		key := ctx.pop()
		obj := ctx.pop()
		ctx.push(getPropertyDynamic(obj, key))

	case 28: // conditional jump with push: if (stack.pop()) cursor += key, push++
		val := ctx.pop()
		key := ctx.nextArg(taskarr)
		if toFloat(val) != 0 {
			ctx.cursor += key
			ctx.push(val) // ++stack cursor
		}

	case 29: // push loop_res[taskarr[++cursor]]
		idx := ctx.nextArg(taskarr)
		ctx.push(ctx.getLoopRes(idx))

	case 30: // negated conditional jump: if (!stack.pop()) cursor += key, push++
		val := ctx.pop()
		key := ctx.nextArg(taskarr)
		if toFloat(val) == 0 {
			ctx.cursor += key
			ctx.push(val)
		}

	case 31: // call method with 2 args from stack (same as 23 but different setup)
		ctx.stack = ctx.stack[:len(ctx.stack)-2]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc2(fn, ctx.stack[argIdx], ctx.stack[argIdx+1]))

	case 32: // push args[taskarr[++cursor]]
		idx := ctx.nextArg(taskarr)
		if idx < len(ctx.args) {
			ctx.push(ctx.args[idx])
		} else {
			ctx.push(nil)
		}

	case 33: // set property with key from taskarr
		val := ctx.pop()
		obj := ctx.pop()
		keyIdx := ctx.nextArg(taskarr)
		setPropertyDynamic(obj, keyIdx, val)

	case 34: // return: ret[4]=1, ret[5]=stack.pop(), jump to h7
		val := ctx.pop()
		for len(ctx.ret) <= 5 {
			ctx.ret = append(ctx.ret, nil)
		}
		ctx.ret[4] = float64(1)
		ctx.ret[5] = val
		// Jump to end (h7 = taskarr length)
		ctx.cursor = len(ctx.task.Taskarr)

	case 36: // increment: curObj[curKey]++
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = toFloat(obj[ctx.curKey]) + 1
		ctx.push(obj[ctx.curKey])

	case 37: // push data[taskarr[++cursor]]
		idx := ctx.nextArg(taskarr)
		if idx < len(ctx.data) {
			ctx.push(ctx.data[idx])
		} else {
			ctx.push(nil)
		}

	case 38: // push immediate: stack.push(taskarr[++cursor])
		val := ctx.nextArg(taskarr)
		ctx.push(float64(val))

	case 42: // call with 1 arg (like opcode 7 but different setup)
		ctx.stack = ctx.stack[:len(ctx.stack)-1]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.stack[argIdx] = callFunc(fn, ctx.stack[argIdx])

	case 43: // addition: b + a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(toFloat(b) + toFloat(a))

	case 51: // greater than: b > a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(toFloat(b) > toFloat(a))

	case 54: // jump backward: cursor -= taskarr[++cursor]
		jump := ctx.nextArg(taskarr)
		ctx.cursor -= jump

	case 59: // jump forward: cursor += taskarr[++cursor]
		jump := ctx.nextArg(taskarr)
		ctx.cursor += jump

	case 60: // set curObj and curKey from stack
		key := ctx.pop()
		obj := ctx.pop()
		ctx.curKey = toInt(key)
		ctx.curObj = obj

	case 61: // call method with 0 args (like 19 but different setup)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc(fn))

	case 62: // push empty array
		ctx.push([]interface{}{})

	case 63: // array push: stack[-1].push(stack.pop())
		val := ctx.pop()
		arr, _ := ctx.stack[len(ctx.stack)-1].([]interface{})
		ctx.stack[len(ctx.stack)-1] = append(arr, val)

	case 68: // call method with 3 args from stack
		if len(ctx.stack) < 3 {
			return fmt.Errorf("op68 stack underflow: stack=%d", len(ctx.stack))
		}
		ctx.stack = ctx.stack[:len(ctx.stack)-3]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc3(fn, ctx.stack[argIdx], ctx.stack[argIdx+1], ctx.stack[argIdx+2]))

	case 69: // multiplication: b * a
		a := ctx.pop()
		b := ctx.pop()
		ctx.push(toFloat(b) * toFloat(a))

	case 93: // set and push: curObj[curKey] = stack.pop(); push it back
		val := ctx.pop()
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = val
		ctx.push(val)

	case 94: // modulo: b % a
		a := ctx.pop()
		b := ctx.pop()
		if toFloat(a) == 0 {
			ctx.push(math.NaN())
		} else {
			ctx.push(math.Mod(toFloat(b), toFloat(a)))
		}

	case 95: // switch/case jump
		val := ctx.pop()
		keyIdx := ctx.nextArg(taskarr)
		// Lookup in switch table
		_ = keyIdx
		// Simplified: this is a case dispatch
		// _$aQ = switchTable[key]; dc = aQ[val]; dc == default ? dc = taskarr[++cursor] : ++cursor; cursor += dc
		defaultJump := ctx.nextArg(taskarr)
		ctx.cursor += defaultJump
		_ = val

	case 96: // XOR assignment: curObj[curKey] ^= stack.pop()
		val := ctx.pop()
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = float64(toInt(obj[ctx.curKey]) ^ toInt(val))
		ctx.push(obj[ctx.curKey])

	case 97: // left shift: b << a
		a := toInt(ctx.pop())
		b := toInt(ctx.pop())
		ctx.push(float64(jsLeftShift(b, a)))

	case 98: // unsigned right shift: b >>> a
		a := toInt(ctx.pop())
		b := toInt(ctx.pop())
		ctx.push(float64(jsUnsignedRightShift(b, a)))

	case 99: // pre-increment: ++curObj[curKey]
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = toFloat(obj[ctx.curKey]) + 1
		ctx.push(obj[ctx.curKey])

	case 100: // call method with 3 args (like 68 but different setup)
		ctx.stack = ctx.stack[:len(ctx.stack)-3]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc3(fn, ctx.stack[argIdx], ctx.stack[argIdx+1], ctx.stack[argIdx+2]))

	case 101: // push property: stack.push(stack.pop()[taskarr[++cursor]])
		key := ctx.nextArg(taskarr)
		val := ctx.pop()
		ctx.push(getProperty(val, key))

	case 102: // call method with 4 args from stack
		ctx.stack = ctx.stack[:len(ctx.stack)-4]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc4(fn, ctx.stack[argIdx], ctx.stack[argIdx+1], ctx.stack[argIdx+2], ctx.stack[argIdx+3]))

	case 103: // bitwise NOT: ~stack.pop()
		val := toInt(ctx.pop())
		ctx.push(float64(^val))

	case 104: // call with apply (like 25 but returns void)
		n := ctx.nextArg(taskarr)
		args := make([]interface{}, n)
		start := len(ctx.stack) - n
		copy(args, ctx.stack[start:])
		ctx.stack = ctx.stack[:start]
		fn := ctx.getCurAsFunc()
		ctx.push(callFuncN(fn, args))

	case 105: // call method with 4 args (like 102 but different setup)
		ctx.stack = ctx.stack[:len(ctx.stack)-4]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc4(fn, ctx.stack[argIdx], ctx.stack[argIdx+1], ctx.stack[argIdx+2], ctx.stack[argIdx+3]))

	case 106: // set context from j1 table
		idx1 := ctx.nextArg(taskarr)
		idx2 := ctx.nextArg(taskarr)
		_ = idx1
		ctx.curKey = idx2
		// curObj = j1[idx1] (some lookup table)

	case 107: // property access with fa remap
		_ = ctx.nextArg(taskarr) // skip 71 marker
		key := ctx.nextArg(taskarr)
		val := ctx.pop()
		ctx.push(getProperty(val, key))

	case 108: // set curObj=stack, curKey=stack.length-1
		ctx.curObj = ctx.stack
		ctx.curKey = len(ctx.stack) - 1

	case 109: // debugger (no-op)
		// skip

	case 110: // bitwise OR: b | a
		a := toInt(ctx.pop())
		b := toInt(ctx.pop())
		ctx.push(float64(b | a))

	case 111: // call method with 5 args from stack
		ctx.stack = ctx.stack[:len(ctx.stack)-5]
		argIdx := len(ctx.stack)
		fn := ctx.getCurAsFunc()
		ctx.push(callFunc5(fn, ctx.stack[argIdx], ctx.stack[argIdx+1], ctx.stack[argIdx+2], ctx.stack[argIdx+3], ctx.stack[argIdx+4]))

	case 112: // AND assignment: curObj[curKey] &= stack.pop()
		val := ctx.pop()
		obj := ctx.getCurObjAsMap()
		obj[ctx.curKey] = float64(toInt(obj[ctx.curKey]) & toInt(val))
		ctx.push(obj[ctx.curKey])

	case 113: // division: b / a
		a := toFloat(ctx.pop())
		b := toFloat(ctx.pop())
		if a == 0 {
			ctx.push(math.Inf(1))
		} else {
			ctx.push(b / a)
		}

	case 114: // negation: -stack.pop()
		val := toFloat(ctx.pop())
		ctx.push(-val)

	default:
		// Unknown opcode - try to handle via commonFunc dispatch
		ctx.execViaCommonFunc(opcode, taskarr)
	}
	return nil
}

// nextArg reads the next immediate argument from taskarr and advances cursor.
func (ctx *execContext) nextArg(taskarr []int) int {
	if ctx.cursor >= len(taskarr) {
		return 0
	}
	val := taskarr[ctx.cursor]
	ctx.cursor++
	return val
}

// push pushes a value onto the stack.
func (ctx *execContext) push(val interface{}) {
	ctx.stack = append(ctx.stack, val)
}

// pop removes and returns the top of the stack.
func (ctx *execContext) pop() interface{} {
	if len(ctx.stack) == 0 {
		return nil
	}
	val := ctx.stack[len(ctx.stack)-1]
	ctx.stack = ctx.stack[:len(ctx.stack)-1]
	return val
}

// getCurObjAsMap returns the current object as a map[int]interface{}.
// The current object can be: cp2 (global_res), args, data, or loop_res.
func (ctx *execContext) getCurObjAsMap() map[int]interface{} {
	switch obj := ctx.curObj.(type) {
	case map[int]interface{}:
		return obj
	case []float64:
		// Convert cp2 array to map
		m := make(map[int]interface{})
		for i, v := range obj {
			m[i] = v
		}
		ctx.curObj = m
		return m
	case []interface{}:
		m := make(map[int]interface{})
		for i, v := range obj {
			m[i] = v
		}
		ctx.curObj = m
		return m
	default:
		m := make(map[int]interface{})
		ctx.curObj = m
		return m
	}
}

// getCurAsFunc returns the current object+key as a callable.
func (ctx *execContext) getCurAsFunc() interface{} {
	// In the real VM, this does curObj[curKey]
	// which could be a function from loop_res or a method
	return ctx.getCurValue()
}

// getCurValue returns curObj[curKey].
func (ctx *execContext) getCurValue() interface{} {
	switch obj := ctx.curObj.(type) {
	case []float64:
		if ctx.curKey >= 0 && ctx.curKey < len(obj) {
			return obj[ctx.curKey]
		}
	case []interface{}:
		if ctx.curKey >= 0 && ctx.curKey < len(obj) {
			return obj[ctx.curKey]
		}
	case map[int]interface{}:
		return obj[ctx.curKey]
	}
	return nil
}

// getKeyname returns gv.ts.cp[1][idx] - the keyname at index.
func (ctx *execContext) getKeyname(idx int) interface{} {
	// For offset computation, keynames are not needed
	// Return the index itself as placeholder
	return float64(idx)
}

// makeBoundFunc creates a bound function reference.
func (ctx *execContext) makeBoundFunc(idx int) interface{} {
	return fmt.Sprintf("boundFunc_%d", idx)
}

// getLoopRes returns the loop_res value at the given index.
// This is the Proxy that:
// 1. For index < child_one.length: returns a function that runs the child task
// 2. For index in offsetConst: returns offsetConst[index]
// 3. For U14124020: sets offsetConst[idx]=3, [idx+1]=51, [idx+2]=153
func (ctx *execContext) getLoopRes(idx int) interface{} {
	// Check offsetConst first
	if val, ok := ctx.offsetConst[idx]; ok {
		return val
	}

	// Check if this is a child task index
	root := ctx.te.Tree.Root
	if idx >= 0 && idx < len(root.ChildOne) && root.ChildOne[idx] != nil {
		// Return a function that runs the child task
		childTask := root.ChildOne[idx]
		return func(args ...interface{}) interface{} {
			// Check for custom task
			result, _ := ctx.te.RunTask(childTask, args, ctx.taskarrOverride)
			return result
		}
	}

	// U14124020 special case
	if ctx.task.UID == "U14124020" {
		ctx.offsetConst[idx] = 3
		ctx.offsetConst[idx+1] = 51
		ctx.offsetConst[idx+2] = 153
		return ctx.offsetConst[idx]
	}

	return nil
}

// execViaCommonFunc handles opcodes that use the commonFunc dispatcher.
// The commonFunc reads a type code from taskarr and sets curObj/curKey accordingly.
func (ctx *execContext) execViaCommonFunc(opcode int, taskarr []int) {
	// The commonFunc (_$iX/_$dn/_$eF) reads a type code from taskarr[++cursor]
	// and dispatches to set curObj and curKey
	typeCode := ctx.nextArg(taskarr)
	ctx.dispatchCommonFunc(typeCode, taskarr)
}

// dispatchCommonFunc implements the commonFunc dispatcher logic.
// Based on the captured commonFunc:
//
//	function _$iX() {
//	  var _$_t = _$aX[++_$a9];
//	  _$_t <= 21 ?
//	    _$_t <= 5 ? (_$k2 = _$aX[++_$a9], _$kU = _$$y) :        // type 0-5: global_res (cp2)
//	    _$_t <= 11 ? (_$k2 = _$aX[++_$a9], _$kU = _$a8) :       // type 6-11: args (ret[0])
//	    _$_t <= 14 ? (_$k2 = _$aX[++_$a9], _$kU = _$bZ) :       // type 12-14: data
//	    (_$k2 = _$aX[++_$a9], _$kU = _$i2)                      // type 15-21: keynames
//	  : _$_t <= 60 ?
//	    _$_t <= 46 ? (_$aX[_$a9]=85, _$k2=_$cy[_$aX[++_$a9]], _$aX[_$a9]=_$k2, _$kU=_$dy[--_$ff]) : // type 22-46: property from stack
//	    _$_t <= 49 ? (_$aX[_$a9]=85, _$k2=_$fa[_$aX[++_$a9]], _$aX[_$a9]=_$k2, _$kU=_$dy[--_$ff]) : // type 47-49
//	    _$_t <= 50 ? (_$$U=_$aX[++_$a9], _$k2=_$aX[++_$a9], _$kU=_$fT[_$$U]) : // type 50
//	    (_$k2=_$dy[--_$ff], _$kU=_$dy[--_$ff])                  // type 51-60: both from stack
//	  : _$_t <= 85 ? (_$k2 = _$aX[++_$a9], _$kU = _$dy[--_$ff]) : // type 61-85: key from taskarr, obj from stack
//	  : _$_t <= 106 ? (_$$U=_$aX[++_$a9], _$k2=_$aX[++_$a9], _$kU=_$j1[_$$U]) : // type 86-106
//	  (--_$ff, _$kU=_$dy, _$k2=_$ff);                           // type 107+: stack itself
//	}
func (ctx *execContext) dispatchCommonFunc(typeCode int, taskarr []int) {
	switch {
	case typeCode <= 5:
		// global_res (cp2)
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.te.Cp2

	case typeCode <= 11:
		// args (ret[0])
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.args

	case typeCode <= 14:
		// data array
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.data

	case typeCode <= 21:
		// keynames
		ctx.curKey = ctx.nextArg(taskarr)
		// curObj = keynames (not needed for offset)

	case typeCode <= 46:
		// property from stack: key = lookupTable[taskarr[++cursor]], obj = stack.pop()
		key := ctx.nextArg(taskarr)
		obj := ctx.pop()
		ctx.curKey = key
		ctx.curObj = obj

	case typeCode <= 49:
		// similar to 46 but different lookup table
		key := ctx.nextArg(taskarr)
		obj := ctx.pop()
		ctx.curKey = key
		ctx.curObj = obj

	case typeCode == 50:
		// _$fT table lookup
		idx1 := ctx.nextArg(taskarr)
		idx2 := ctx.nextArg(taskarr)
		_ = idx1
		ctx.curKey = idx2

	case typeCode <= 60:
		// both from stack
		key := ctx.pop()
		obj := ctx.pop()
		ctx.curKey = toInt(key)
		ctx.curObj = obj

	case typeCode <= 85:
		// key from taskarr, obj from stack
		ctx.curKey = ctx.nextArg(taskarr)
		ctx.curObj = ctx.pop()

	case typeCode <= 106:
		// j1 table lookup
		idx1 := ctx.nextArg(taskarr)
		idx2 := ctx.nextArg(taskarr)
		_ = idx1
		ctx.curKey = idx2

	default:
		// stack itself
		val := ctx.pop()
		ctx.curObj = ctx.stack
		ctx.curKey = len(ctx.stack) - 1
		_ = val
	}
}

// ==================== Helper functions ====================

func toStringSlice(v []interface{}) []string {
	result := make([]string, len(v))
	for i, x := range v {
		if s, ok := x.(string); ok {
			result[i] = s
		}
	}
	return result
}

func getString(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	case bool:
		if n {
			return 1
		}
		return 0
	default:
		return 0
	}
}

func toFloat(v interface{}) float64 {
	switch n := v.(type) {
	case int:
		return float64(n)
	case int64:
		return float64(n)
	case float64:
		return n
	case bool:
		if n {
			return 1
		}
		return 0
	default:
		return 0
	}
}

func jsLeftShift(b, a int) int {
	// JS << operates on int32, shift amount mod 32
	return int(int32(b) << uint(a&31))
}

func jsUnsignedRightShift(b, a int) uint32 {
	// JS >>> operates on uint32
	return uint32(int32(b)) >> uint(a&31)
}

func getProperty(obj interface{}, key int) interface{} {
	switch o := obj.(type) {
	case []float64:
		if key >= 0 && key < len(o) {
			return o[key]
		}
	case []interface{}:
		if key >= 0 && key < len(o) {
			return o[key]
		}
	case []int:
		if key >= 0 && key < len(o) {
			return float64(o[key])
		}
	case map[int]interface{}:
		return o[key]
	}
	return nil
}

func getPropertyDynamic(obj, key interface{}) interface{} {
	return getProperty(obj, toInt(key))
}

func setPropertyDynamic(obj interface{}, key int, val interface{}) {
	// Simplified property setter
}

func callFunc(fn interface{}, args ...interface{}) interface{} {
	if f, ok := fn.(func(...interface{}) interface{}); ok {
		return f(args...)
	}
	return nil
}

func callFunc2(fn interface{}, a, b interface{}) interface{} {
	if f, ok := fn.(func(...interface{}) interface{}); ok {
		return f(a, b)
	}
	return nil
}

func callFunc3(fn interface{}, a, b, c interface{}) interface{} {
	if f, ok := fn.(func(...interface{}) interface{}); ok {
		return f(a, b, c)
	}
	return nil
}

func callFunc4(fn interface{}, a, b, c, d interface{}) interface{} {
	if f, ok := fn.(func(...interface{}) interface{}); ok {
		return f(a, b, c, d)
	}
	return nil
}

func callFunc5(fn interface{}, a, b, c, d, e interface{}) interface{} {
	if f, ok := fn.(func(...interface{}) interface{}); ok {
		return f(a, b, c, d, e)
	}
	return nil
}

func callFuncN(fn interface{}, args []interface{}) interface{} {
	if f, ok := fn.(func(...interface{}) interface{}); ok {
		return f(args...)
	}
	return nil
}

// ==================== R2mka Parser ====================

// r2mkaCodeParser parses the r2mkaText binary format from char code array.
// This is a direct port of src/handler/parser/r2mka.js.
type r2mkaCodeParser struct {
	codes []int
	curr  int
}

func (p *r2mkaCodeParser) getCurr() int { return p.curr }

func (p *r2mkaCodeParser) getCode() int {
	if p.curr >= len(p.codes) {
		return 0
	}
	code := p.codes[p.curr]
	p.curr++
	return code
}

func (p *r2mkaCodeParser) getLine() []int {
	end := p.getCode()
	if end == 0 {
		return []int{}
	}
	if p.curr+end > len(p.codes) {
		end = len(p.codes) - p.curr
		if end <= 0 {
			return []int{}
		}
	}
	ans := p.codes[p.curr : p.curr+end]
	p.curr += end
	return ans
}

func (p *r2mkaCodeParser) getList() [][]int {
	line := p.getLine()
	if len(line) == 0 {
		return [][]int{}
	}
	// Split by char code 255
	var result [][]int
	start := 0
	for i, c := range line {
		if c == 255 {
			result = append(result, line[start:i])
			start = i + 1
		}
	}
	result = append(result, line[start:])
	return result
}

func (p *r2mkaCodeParser) deepParse() *R2mkaTask {
	ans := &R2mkaTask{
		Lens:    p.getCode(),
		IsReset: p.getCode(),
	}
	line := p.getLine()
	if len(line) == 0 {
		ans.Taskarr = []int{}
	} else {
		ans.Taskarr = line
	}
	ans.Taskori = make([]int, len(ans.Taskarr))
	copy(ans.Taskori, ans.Taskarr)

	curr := p.getCode()
	ans.ChildOne = make([]*R2mkaTask, curr+2)
	for i := 0; i < curr; i++ {
		ans.ChildOne[i+2] = p.deepParse()
	}
	curr = p.getCode()
	ans.ChildTwo = make([]*R2mkaTask, curr)
	for i := 0; i < curr; i++ {
		ans.ChildTwo[i] = p.deepParse()
	}

	return ans
}

// ParseR2mkaText parses r2mkaText (as []int char codes) into a task tree with UID lookups.
func ParseR2mkaText(r2mkaCodes []int) *R2mkaTree {
	r2mkaLen := len("r2mka")
	p := &r2mkaCodeParser{codes: r2mkaCodes, curr: r2mkaLen + 1}

	// Skip two lists (not used)
	p.getList()
	p.getList()

	// windowIdx and resourceIdx (not used for our purposes)
	_ = p.getCode() // windowIdx
	_ = p.getCode() // resourceIdx

	root := p.deepParse()

	// Debug: dump UIDs
	tree := &R2mkaTree{
		Root:  root,
		ByUID: make(map[string][]*R2mkaTask),
	}

	// Build UID lookup
	count := 0
	var buildLookup func(t *R2mkaTask, depth int)
	buildLookup = func(t *R2mkaTask, depth int) {
		if t == nil {
			return
		}
		t.Key = fmt.Sprintf("%d-%d", depth, count)
		count++

		// Compute UID
		// JS: child_one.length includes leading holes (new Array(curr+2))
		// Go: len(ChildOne) is the actual slice length which includes the nil slots
		childOneLen := len(t.ChildOne)
		childTwoLen := len(t.ChildTwo)
		uidInput := fmt.Sprintf("%d-%d-%d-%d-%d-%d", depth, t.Lens, t.IsReset, len(t.Taskarr), childOneLen, childTwoLen)
		t.UID = "U" + computeUID(uidInput)

		// Debug: check if this is U14124020
		if strings.Contains(t.UID, "14124") {
			fmt.Fprintf(os.Stderr, "  [r2mka] Found UID=%s key=%s depth=%d lens=%d isReset=%d taskarrLen=%d childOne=%d childTwo=%d\n",
				t.UID, t.Key, depth, t.Lens, t.IsReset, len(t.Taskarr), childOneLen, childTwoLen)
		}

		tree.ByUID[t.UID] = append(tree.ByUID[t.UID], t)

		for _, c := range t.ChildOne {
			if c != nil {
				buildLookup(c, depth+1)
			}
		}
		for _, c := range t.ChildTwo {
			if c != nil {
				buildLookup(c, depth+1)
			}
		}
	}
	buildLookup(root, 0)

	return tree
}

// computeUID computes the UID from a string like "1-4-1-180-0-0".
// This matches the JS: string2ascii(hexnum(uid))
func computeUID(input string) string {
	hexResult := hexnum(input)
	var result strings.Builder
	for _, c := range hexResult {
		result.WriteString(fmt.Sprintf("%d", c))
	}
	return result.String()
}

// hexnum converts a string to hex char codes.
// Port of src/handler/parser/common/hexnum.js
// JS: processes 2 chars at a time, parseInt(pair, 16)
// JS parseInt stops at non-hex chars (like '-'), so "1-" → 1, "0-" → 0
func hexnum(input string) string {
	var result []rune
	for i := 0; i < len(input); i += 2 {
		end := i + 2
		if end > len(input) {
			end = len(input)
		}
		pair := input[i:end]
		// Parse hex like JS parseInt: scan from left, stop at non-hex char
		val := jsParseIntHex(pair)
		result = append(result, rune(val))
	}
	return string(result)
}

// jsParseIntHex mimics JS parseInt(str, 16) - parses leading hex digits, stops at non-hex
func jsParseIntHex(s string) int {
	val := 0
	parsed := false
	for _, c := range s {
		var d int
		switch {
		case c >= '0' && c <= '9':
			d = int(c - '0')
		case c >= 'a' && c <= 'f':
			d = int(c-'a') + 10
		case c >= 'A' && c <= 'F':
			d = int(c-'A') + 10
		default:
			if !parsed {
				return 0 // NaN equivalent
			}
			return val
		}
		val = val*16 + d
		parsed = true
	}
	return val
}

// ==================== GetTaskarr ====================

// GetTaskarr extracts task segments from the parsed cd section.
// Port of tscd.js getTaskarr function.
// It modifies the r2mka tree's child_one taskarr values.
func GetTaskarr(tree *R2mkaTree, arr []int, idx int) map[int][]int {
	result := make(map[int][]int)
	getTaskarrRecursive(tree, arr, idx, result)
	return result
}

func getTaskarrRecursive(tree *R2mkaTree, arr []int, idx int, result map[int][]int) {
	if idx >= len(arr) {
		return
	}
	start := idx + 1
	end := start + arr[idx]
	if end > len(arr) {
		return
	}
	key := arr[idx-2]

	segment := make([]int, end-start)
	copy(segment, arr[start:end])
	result[key] = segment

	// Update the r2mka tree's child_one taskarr
	root := tree.Root
	if key >= 0 && key < len(root.ChildOne) && root.ChildOne[key] != nil {
		root.ChildOne[key].Taskarr = segment
	}

	if end+2 < len(arr) {
		getTaskarrRecursive(tree, arr, end+2, result)
	}
}

// ==================== ComputeOffset ====================

// ComputeOffset runs the U14124020 task to compute the 8-byte offset.
// This is the main entry point for the task engine.
func ComputeOffset(codemapJSON []byte, r2mkaCodes []int, cp2 []float64, cdSection []int) ([]int, error) {
	// Parse codemap
	te, err := NewTaskEngine(codemapJSON, cp2)
	if err != nil {
		return nil, fmt.Errorf("create task engine: %w", err)
	}

	// Parse r2mka text
	tree := ParseR2mkaText(r2mkaCodes)
	te.SetTree(tree)

	// Extract task segments from cd section
	// cdSection is the parsed "one" array (after parseCdSection)
	taskarrOverride := GetTaskarr(tree, cdSection, cdSection[3])

	// Run U14124020 task
	result, err := te.RunTaskByUID("U14124020", []interface{}{}, taskarrOverride)
	if err != nil {
		// If task engine fails, return error
		return nil, fmt.Errorf("run U14124020: %w", err)
	}

	// Convert result to []int
	if result == nil {
		return nil, fmt.Errorf("U14124020 returned nil")
	}

	switch v := result.(type) {
	case []int:
		return v, nil
	case []interface{}:
		offset := make([]int, len(v))
		for i, x := range v {
			offset[i] = toInt(x)
		}
		return offset, nil
	case []float64:
		offset := make([]int, len(v))
		for i, x := range v {
			offset[i] = int(x)
		}
		return offset, nil
	default:
		return nil, fmt.Errorf("U14124020 returned unexpected type: %T", result)
	}
}

// LoadCodemap loads the codemap from a JSON file.
func LoadCodemap(path string) ([]byte, error) {
	return os.ReadFile(path)
}

// SortUIDs returns sorted UIDs for debugging.
func SortUIDs(tree *R2mkaTree) []string {
	uids := make([]string, 0, len(tree.ByUID))
	for uid := range tree.ByUID {
		uids = append(uids, uid)
	}
	sort.Strings(uids)
	return uids
}
