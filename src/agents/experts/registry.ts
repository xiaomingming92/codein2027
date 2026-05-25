import type { ResponseSectionType } from "@/agents/response-strategy"
import type { EvidenceSource } from "@/types/evidence"

export type ReportFormat = "md" | "pdf" | "docx" | "xlsx"

export type ExpertDomain = "种植" | "经济" | "管收"

export interface ExpertInputSchemaItem {
  key: string
  label: string
  required: boolean
}

export interface ExpertEvidenceFilter {
  keywords?: string[]
  sourceTypes?: EvidenceSource[]
}

export interface AnalysisExpert {
  id: string
  label: string
  domain: ExpertDomain
  description: string
  inputSchema: ExpertInputSchemaItem[]
  outputSections: ResponseSectionType[]
  promptTemplate: string
  evidenceFilter?: ExpertEvidenceFilter
  reportFormats: ReportFormat[]
}

export const ANALYSIS_EXPERTS: Record<string, AnalysisExpert> = {
  crop_compare: {
    id: "crop_compare",
    label: "作物对比分析",
    domain: "种植",
    description: "多作物间的品种特性、产量预期、气候适应性和种植成本横向对比分析，辅助种植决策",
    inputSchema: [
      { key: "crops", label: "对比作物", required: true },
      { key: "location", label: "种植区域", required: true },
      { key: "season", label: "种植季节", required: true },
    ],
    outputSections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"],
    promptTemplate: `你是一个作物对比分析专家，专注于品种特性、产量预期和气候适应性的横向对比。

分析维度：
1. 品种特性对比：生长期、抗逆性、水肥需求差异
2. 产量预期：基于区域气候数据和历史产量数据
3. 气候适应性：各作物对当地气候条件的匹配度
4. 种植成本：种子、水肥、人工成本横向比较
5. 风险因素：病虫害风险、市场价格波动、极端天气概率

输出要求：
- 每个对比维度给出明确优劣判断
- 引用知识库中的具体证据和数值
- 给出综合推荐和替代方案`,
    evidenceFilter: {
      keywords: ["作物", "品种", "产量", "种植", "气候适应性", "生长期"],
      sourceTypes: ["document", "knowledge"],
    },
    reportFormats: ["md", "xlsx"],
  },

  roi_analysis: {
    id: "roi_analysis",
    label: "ROI 投资回报分析",
    domain: "经济",
    description: "投入产出比分析、成本收益核算、经济可行性评估，支持经营决策",
    inputSchema: [
      { key: "crop", label: "目标作物", required: true },
      { key: "area", label: "种植面积(亩)", required: true },
      { key: "budget", label: "预算上限(元)", required: false },
    ],
    outputSections: ["conclusion", "evidence", "reasoning", "confidence", "risk"],
    promptTemplate: `你是农业经济分析专家，专注于种植项目的投入产出比和投资回报分析。

分析维度：
1. 直接成本：种子、肥料、农药、水费、机械作业费
2. 间接成本：人工、运输、仓储、管理
3. 预期收益：目标产量 × 市场均价 × 品质系数
4. 敏感性分析：价格浮动 ±20% 对利润的影响
5. 回收期与净现值

输出要求：
- 给出明确的盈亏平衡点
- 标注各成本项占比
- 识别最大成本驱动因素
- 提供成本优化建议`,
    evidenceFilter: {
      keywords: ["成本", "价格", "收益", "市场", "投入", "产出", "利润"],
      sourceTypes: ["document", "economic"],
    },
    reportFormats: ["md", "xlsx"],
  },

  pest_risk: {
    id: "pest_risk",
    label: "病虫害风险评估",
    domain: "管收",
    description: "基于气象条件、历史病虫害数据和作物生长阶段，评估病虫害发生概率和影响程度",
    inputSchema: [
      { key: "crop", label: "目标作物", required: true },
      { key: "stage", label: "生长阶段", required: true },
      { key: "location", label: "种植区域", required: true },
    ],
    outputSections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "action_steps"],
    promptTemplate: `你是农业植保专家，专注于病虫害风险识别与防治方案制定。

分析维度：
1. 当前气象条件对病虫害发生的影响（温湿度、降雨）
2. 作物当前生长阶段的高发病虫害清单
3. 历史同期病虫害发生记录
4. 各类病虫害的发生概率和危害程度评级
5. 防治方案：化学防治、生物防治、农业防治

输出要求：
- 病虫害按风险等级排序（高/中/低）
- 每种病虫害给出识别特征和危害阈值
- 防治方案区分预防性措施和应急措施
- 标注用药安全间隔期`,
    evidenceFilter: {
      keywords: ["病虫害", "防治", "植保", "农药", "气象", "虫害", "病害"],
      sourceTypes: ["document", "knowledge"],
    },
    reportFormats: ["md", "xlsx"],
  },
}
