#!/bin/bash

echo "🔍 知识库系统修复验证"
echo "========================"
echo ""

echo "1️⃣  测试统计接口..."
curl -s "http://localhost:3000/api/knowledge/sync" | jq -r '
  if .success then
    "   ✅ 统计数据:\n      总计: \(.data.total)\n      已索引: \(.data.indexed)\n      待处理: \(.data.pending)\n      处理中: \(.data.indexing)\n      错误: \(.data.errors)\n      来源分布: 静态\(.data.bySource.projectDoc) / 上传\(.data.bySource.knowledgeUpdate)"
  else
    "   ❌ 失败: \(.error)"
  end
'
echo ""

echo "2️⃣  测试文档列表..."
RESPONSE=$(curl -s "http://localhost:3000/api/knowledge/documents")
TOTAL=$(echo $RESPONSE | jq '.total')
echo "   ✅ 返回 $TOTAL 个文档"
echo ""

if [ "$TOTAL" -gt 0 ]; then
  echo "3️⃣  文档状态分布:"
  echo $RESPONSE | jq -r '
    .data | group_by(.status) | map({
      status: .[0].status,
      count: length,
      names: [.[].name][:3]
    }) | .[] | "   \(status): \(count) 个 (\(names | join(", "))...)"'
  echo ""
  
  echo "4️⃣  来源类型分布:"
  echo $RESPONSE | jq -r '
    .data | group_by(.sourceType) | map({
      sourceType: .[0].sourceType,
      count: length
    }) | .[] | "   \(sourceType): \(count) 个"'
fi

echo ""
echo "========================"
echo "✅ 验证完成！"
