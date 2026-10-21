# Costudy UI 原型（三方向对比）

> 按 [emilkowalski/skills](https://github.com/emilkowalski/skills) 的 `prototype` skill 制作
> **不碰生产代码**，全部隔离在本目录

## 怎么看

直接双击 `index.html`（普通浏览器或 Electron 都能开）。

| 操作 | 键 |
|---|---|
| 切换变体 | `1` / `2` / `3`，或 `←` `→` |
| 重播入场动画 | `R` |
| 也可用底部 picker 点击 / 记住 `?v=2` |

## 三个方向

| # | 变体 | 分叉轴 | 什么时候是正确答案 | 代价 |
|---|---|---|---|---|
| 1 | **Studio** | 直接操纵 | 想精确调每个参数的用户 | 需要面对 12 个维度 |
| 2 | **Wizard** | 顺序引导 | 第一次用、不想被一次淹没 | 多几步点击，跨维度比较难 |
| 3 | **Companion** | 对话塑造 | 完全不想碰参数的人 | 精度最低，想微调仍要回到滑条 |

## 每个变体都覆盖两块

**建角色卡**：模板起步 / 12 维性格滑条 / 教学取向 / 语言习惯 / 编译提示词预览
**学习界面**：今日目标 / 知识点进度 / 复习队列 / 高频错误 / 学习者画像

- Studio：一屏两栏，左滑条右预览；学习界面是"对话 + 数据侧栏"
- Wizard：4 步向导 + 进度 rail；学习界面是"课表优先"
- Companion：AI 问 4 个问题生成卡；学习界面是"对话优先 + 浮动 dock + 可收起计划"

## 工艺规范（全部遵守）

- 缓动：`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`，**从不使用 ease-in**
- 时长：按压 160ms / 提示 150ms / 弹出 200ms / 弹窗 320ms，**全部 < 300ms**
- 属性：只动 `transform` 与 `opacity`（picker 的 width 是规范允许的唯一例外）
- 入场：`scale(0.95) + opacity: 0`，**绝不 scale(0)**
- 按压反馈：`transform: scale(0.97)`
- 预览文字更新用 `blur(2px)` 桥接（避免两个状态重叠）
- `prefers-reduced-motion` 与 `hover: hover` 已处理
- picker 的样式与行为**逐字照抄 PICKER.md**

## 文件

```
index.html              入口 + picker（PICKER.md 逐字实现）
tokens.css              设计 token + 原子样式 + picker 样式
data.js                 共享数据模型（12 维、模板、真实课程内容）
ui.js                   共享组件（滑条、开关、分段控件）
variant-studio.js       方向 1
variant-wizard.js       方向 2
variant-companion.js    方向 3
_shots/                 6 张截图（每个变体：建卡 + 学习）
```

## 截图的空白是相机造成的

无头截图会把窗口撑到文档全高，比内容高，于是底部留白 —— 真实窗口里不会出现。

## 下一步

选定方向后（Phase 6）：
1. 把该方向整合进 `src/renderer/`
2. 删除本原型目录
3. 另外两个方向不再保留
