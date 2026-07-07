---
title: AI 项目计划生成系统实现规范
version: 1.0
status: draft
purpose: 给弱 AI 或工程实现者使用的实现级规范，定义模块、数据、接口、写入顺序、错误处理与测试要求。
---

# AI 项目计划生成系统实现规范

## 1. 目标

本文档给出可以直接用于实现的规范。目标不是讲概念，而是把系统如何落地说清楚。

## 2. 建议模块拆分

### 2.1 输入层

职责：接收用户输入、历史版本引用、锁定指令。

### 2.2 收敛层

职责：识别缺口、生成问题、整理回答、区分确认项与推断项。

### 2.3 生成层

职责：输出正文、摘要、模板化文档。

### 2.4 变更层

职责：生成变更日志、差异文件、影响范围说明。

### 2.5 存储层

职责：写入版本目录、日志目录、差异目录、锁定目录。

### 2.6 索引层

职责：维护 `current/latest_plan.md`、锁定入口、历史入口。

## 3. 核心数据对象

### 3.1 Idea

```ts
type Idea = {
  id: string;
  text: string;
  source: 'user' | 'history' | 'derived';
};
```

### 3.2 QuestionBatch

```ts
type QuestionBatch = {
  round: number;
  topic: string;
  questions: string[];
};
```

### 3.3 AnswerSet

```ts
type AnswerSet = {
  round: number;
  answers: string[];
  confirmed: string[];
  rejected: string[];
  pending: string[];
};
```

### 3.4 Version

```ts
type Version = {
  id: string;
  status: 'draft' | 'collecting' | 'refining' | 'confirmed' | 'locked' | 'derived';
  stage: 'understanding' | 'collecting' | 'generating' | 'syncing' | 'locklock';
  createdAt: string;
  parentVersionId?: string;
};
```

### 3.5 ChangeRecord

```ts
type ChangeRecord = {
  id: string;
  fromVersion: string;
  toVersion: string;
  type: 'add' | 'modify' | 'delete' | 'restructure' | 'clarify' | 'lock';
  target: string;
  before?: string;
  after?: string;
  reason: string;
  impact: string[];
};
```

## 4. 文件写入顺序

严格顺序必须是：

1. 正文
2. 摘要
3. 日志
4. 索引
5. 差异文件

只要前一步失败，后一步不能继续伪装成功。

## 5. 典型目录结构

```text
project/
├── versions/
│   ├── v0/
│   ├── v1/
│   └── v2_locked/
├── diffs/
├── logs/
├── current/
└── locklock/
```

## 6. 最小 API / 命令建议

### 6.1 创建版本

- 输入：想法、当前上下文、目标版本来源
- 输出：新版本目录、摘要、日志、索引、差异

### 6.2 列出版本

- 输入：项目根目录
- 输出：所有版本及状态

### 6.3 锁定版本

- 输入：版本号、锁定确认
- 输出：锁定结果、锁定摘要、只读入口

### 6.4 基于锁定版本派生

- 输入：锁定版本号、新增目标
- 输出：新版本草案

## 7. `locklock` 实现规则

### 7.1 锁定动作

`locklock` 不是简单改状态，而是一次完整动作：
- 校验前置条件
- 写入锁定摘要
- 固化当前版本
- 更新入口索引
- 标记派生来源

### 7.2 锁定后约束

- 不可修改已锁定版本正文
- 不可直接改写摘要和日志
- 不可覆盖历史差异
- 只能派生新版本

## 8. 错误处理

### 8.1 缺文件

如果摘要、日志、索引、差异任一缺失，不能进入锁定。

### 8.2 冲突

如果用户确认与系统推断冲突，必须优先保留用户确认。

### 8.3 同步失败

如果写入失败，停止后续步骤并返回失败原因。

## 9. 测试要求

至少要覆盖：
- 版本创建
- 版本列表
- 差异生成
- 锁定前检查
- 锁定后只读
- 基于锁定版本派生
- 写入失败回滚

## 10. 验收标准

实现合格的最低标准：
- 能从输入生成版本
- 能维护版本链
- 能生成差异
- 能锁定
- 能派生
- 能完整保留历史
