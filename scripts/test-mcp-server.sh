#!/bin/bash
# MCP Server 快速健康检查脚本
# 验证: MCP 启动 → tools/list → 6 工具注册 → tools/call 返回合法结果

set -e

MCP_SERVER=".ai/scripts/mcp-server.ts"
PASS=0
FAIL=0

green() { echo -e "\033[32m$1\033[0m"; }
red() { echo -e "\033[31m$1\033[0m"; }
bold() { echo -e "\033[1m$1\033[0m"; }

bold "=== MCP Server 健康检查 ==="
echo ""

# 检查 MCP 服务器文件存在
if [ ! -f "$MCP_SERVER" ]; then
  red "❌ MCP 服务器文件不存在: $MCP_SERVER"
  FAIL=$((FAIL + 1))
fi

# Test 1: tools/list
bold "[P1] tools/list 返回工具列表"
RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | timeout 5 npx tsx "$MCP_SERVER" 2>/dev/null || true)

if echo "$RESPONSE" | python3 -c "
import sys, json
try:
  data = json.load(sys.stdin)
  tools = data['result']['tools']
  names = [t['name'] for t in tools]
  expected = ['get_project_context','get_db_schema','get_audit_logger_pattern','check_phase_symmetry','check_failure_path','generate_audit_logger']
  missing = [n for n in expected if n not in names]
  if missing:
    print(f'FAIL|缺少工具: {\", \".join(missing)}')
    sys.exit(1)
  print(f'PASS|6个工具: {\", \".join(names)}')
except Exception as e:
  print(f'FAIL|解析失败: {e}')
  sys.exit(1)
" 2>&1; then
  :
fi

RESULT_LINE=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
tools = data['result']['tools']
print(len(tools))
" 2>/dev/null)
if [ "$RESULT_LINE" = "6" ]; then
  green "  ✅ 6 工具全部注册"
  PASS=$((PASS + 1))
else
  red "  ❌ 工具数不等于 6"
  FAIL=$((FAIL + 1))
fi

# Test 2: tools/call get_project_context
bold "[P2] tools/call get_project_context(scope:package)"
RESPONSE2=$(echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_project_context","arguments":{"scope":"package"}}}' \
  | timeout 5 npx tsx "$MCP_SERVER" 2>/dev/null || true)

if echo "$RESPONSE2" | python3 -c "
import sys, json
data = json.load(sys.stdin)
text = data['result']['content'][0]['text']
if 'team-coordinator-agent' in text and '核心依赖' in text:
  print('PASS')
else:
  print('FAIL')
  sys.exit(1)
" 2>&1 | grep -q "PASS"; then
  green "  ✅ 返回项目信息完整"
  PASS=$((PASS + 1))
else
  red "  ❌ 返回数据不完整"
  FAIL=$((FAIL + 1))
fi

# Test 3: tools/call get_db_schema
bold "[P3] tools/call get_db_schema(ChatMessage)"
RESPONSE3=$(echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_db_schema","arguments":{"model":"ChatMessage"}}}' \
  | timeout 5 npx tsx "$MCP_SERVER" 2>/dev/null || true)

if echo "$RESPONSE3" | python3 -c "
import sys, json
data = json.load(sys.stdin)
text = data['result']['content'][0]['text']
if 'content' in text and 'metadata' in text and 'traceId' in text:
  print('PASS')
else:
  print('FAIL')
  sys.exit(1)
" 2>&1 | grep -q "PASS"; then
  green "  ✅ ChatMessage 模型字段完整（content/metadata/traceId）"
  PASS=$((PASS + 1))
else
  red "  ❌ ChatMessage 模型字段不完整"
  FAIL=$((FAIL + 1))
fi

# Test 4: tools/call check_phase_symmetry
bold "[P4] tools/call check_phase_symmetry(对称代码)"
RESPONSE4=$(echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"check_phase_symmetry","arguments":{"code":"auditPhaseStart(\"A\")...auditPhaseEnd(\"A\")"}}}' \
  | timeout 5 npx tsx "$MCP_SERVER" 2>/dev/null || true)

if echo "$RESPONSE4" | python3 -c "
import sys, json
data = json.load(sys.stdin)
text = data['result']['content'][0]['text']
if '完全对称' in text:
  print('PASS')
else:
  print('FAIL')
  sys.exit(1)
" 2>&1 | grep -q "PASS"; then
  green "  ✅ 阶段对称性检查正常"
  PASS=$((PASS + 1))
else
  red "  ❌ 阶段对称性检查异常"
  FAIL=$((FAIL + 1))
fi

echo ""
bold "=== 检查结果 ==="
green "  通过: $PASS"
if [ "$FAIL" -gt 0 ]; then
  red "  失败: $FAIL"
  exit 1
else
  green "  全部通过 ✅"
fi
