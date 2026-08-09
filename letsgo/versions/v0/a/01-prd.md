# PRD：{项目名称}

## 1. 项目背景与问题定义
- 核心痛点：桌面自动化市场存在明确的工具分层割裂——没有一款产品同时具备「本地快速策略」和「云端 AI 兜底」的级联能力。具体表现为：
  - 传统 RPA（UiPath、Automation Anywhere、Blue Prism）：纯规则驱动，无 AI 级联兜底，匹配失败即失败
  - 轻量 RPA（UI.Vision、OpenRPA、SikuliX）：单层图像匹配，无降级策略，跨机器可靠性差
  - AI 工作流（Dify、Coze、Langflow）：只编排文本和 API 调用，不触碰桌面 GUI 操作
  - Computer Use（Claude Computer Use、Open Interpreter）：纯云端推理，单次 2-5 秒延迟，高频场景成本不可接受
  - 低代码自动化（n8n、Node-RED、ToolJet）：面向 API/数据流编排，不覆盖桌面 GUI 自动化

- 核心价值：引入 5 级级联策略栈架构——坐标回放 → 模板匹配（OpenCV）→ YOLO 特征检测 → OCR 文字定位 → 云端多模态模型——每个执行节点独立配置逐层启用/禁用、置信度阈值、超时策略。本地策略毫秒级零成本命中，云端 API 仅作最后兜底。大幅降低 token 消耗、降低延迟、提升跨场景匹配可靠性。
## 2. 竞品与市场分析
- 市场现状：桌面自动化工具按技术路线可分为 5 大类，每一类在某个维度存在明显短板。市场存在明确空白——「多层级联策略栈架构」尚无产品覆盖。

- 竞品对比：
  - 维度：本方案 vs 传统 RPA vs 轻量 RPA vs AI 工作流 vs Computer Use vs 低代码
  - 核心机制：
    - 本方案：5 级级联策略栈（坐标→模板→YOLO→OCR→云端），每节点独立配置降级策略，本地优先云端兜底
    - 传统 RPA（UiPath / Automation Anywhere / Blue Prism）：规则驱动固定流程，依赖控件树和预定义规则
    - 轻量 RPA（UI.Vision / OpenRPA / SikuliX）：单层图像匹配，开源免费但无降级策略
    - AI 工作流（Dify / Coze / Langflow）：可视化 AI 管线编排，只处理文本和 API，不触碰 GUI
    - Computer Use（Claude Computer Use / Open Interpreter）：端到端 AI 操控桌面，纯云端架构
    - 低代码（n8n / Node-RED / ToolJet）：面向 API 和数据流，不覆盖桌面操作
  - 优势/劣势：
    - 本方案优势：唯一同时具备多层本地快速策略和云端 AI 兜底的产品，在速度、成本、可靠性间取得平衡；劣势：产品复杂度高，用户学习曲线
    - 传统 RPA 优势：企业级成熟生态；劣势：无 AI 容错，高单价
    - 轻量 RPA 优势：开源免费、轻量；劣势：匹配脆弱，跨机器不可靠
    - AI 工作流 优势：可视化编排体验好；劣势：不碰桌面 GUI
    - Computer Use 优势：端到端零配置；劣势：纯云端延迟 2-5 秒，成本高
    - 低代码 优势：API 编排生态丰富；劣势：不覆盖桌面自动化
## 3. 参考项目
**产品形态参考：**
- 项目名称：Open-Adapt
  - 仓库地址：Open-AdaptAI/Open-Adapt（MIT）
  - 核心功能：AI 录屏回放自动化，记录用户操作后自动重放
  - 可借鉴点：交互模式设计、失败重试逻辑
  - 局限性：无多层降级策略栈，单一匹配方式

- 项目名称：robocorp
  - 仓库地址：robocorp/robocorp（Apache 2.0）
  - 核心功能：开发者向 Python RPA 框架
  - 可借鉴点：API 封装方式、任务编排模型
  - 局限性：非可视化，无 AI 级联能力

- 项目名称：self-operating-computer
  - 仓库地址：OthersideAI/self-operating-computer（MIT，18k star）
  - 核心功能：纯云端 GPT-4V 驱动的桌面操作自动化
  - 可借鉴点：验证了纯云端方案的市场需求，相当于策略 5 的单层版本
  - 局限性：无本地快速路径，纯云端延迟高、成本高

- 项目名称：OpenRPA
  - 仓库地址：open-rpa/openrpa（MPL-2.0）
  - 核心功能：传统 Windows RPA 工作流
  - 可借鉴点：工作流录制 UI 交互设计
  - 局限性：依赖控件树，无 AI 图像匹配能力

**节点编排参考：**
- 项目名称：Langflow
  - 仓库地址：langflow-ai/langflow（MIT）
  - 核心功能：拖拽搭建 AI 管线的可视化编辑器
  - 可借鉴点：节点扩展机制、画布交互模式
  - 局限性：只做 AI 管线编排，不覆盖桌面操作

- 项目名称：Rivet
  - 仓库地址：Ironclad/rivet（Apache 2.0）
  - 核心功能：可视化 AI 管线编辑器，支持节点内嵌套
  - 可借鉴点：节点内嵌套策略的设计思路，与策略栈理念一致
  - 局限性：面向 AI 编排，不覆盖桌面自动化

- 项目名称：TaskWeaver
  - 仓库地址：microsoft/TaskWeaver（MIT）
  - 核心功能：代码层的 strategy 抽象和任务编排
  - 可借鉴点：失败重试链设计模式
  - 局限性：非可视化，纯代码层

- 项目名称：AutoGen Studio
  - 仓库地址：microsoft/autogen（MIT）
  - 核心功能：Agent 多步工作流编排
  - 可借鉴点：多步回退/重试逻辑
  - 局限性：面向 Agent 任务，不覆盖 GUI 操作
## 4. 核心场景
- 场景 1：{用户/系统在什么情况下触发，达到什么目的}
