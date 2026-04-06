# design — 实施设计

本目录存放 **可执行的细粒度实施规划**，与产品真源 `docs/总体规划-路线图与导航整合.md`、步号真源 `docs/路线图.md` 配合使用。  
若使用 **v0.app** 等工具出视觉稿，可将导出说明/截图交给实现侧，对照 `src/theme.ts` 与 `src/index.css` 的 token 做页面级落地（不必改业务逻辑）。  
**v2.0 完整参考工程** 在 [`v0-ui-reference/`](./v0-ui-reference/README.md)（Next 子目录，独立 `npm run dev`），规范见其中 `docs/ui-design-specification.md`。  
AI 上下文合并与流式行为见仓库根目录 `docs/ai-context-merge-order.md`。


| 文件                                                     | 说明                                                  |
| ------------------------------------------------------ | --------------------------------------------------- |
| [implementation-steps.md](./implementation-steps.md)   | **主文档**：按阶段拆到子任务级，含验收、依赖、数据与合规注意点                   |
| [seven-modules-ui-spec.md](./seven-modules-ui-spec.md) | **七功能区 + 设置**：路由与参数、壳层与样式 token、可实现性对照              |
| [ppt-source-materials.md](./ppt-source-materials.md)   | **PPT 素材包**：逐页 `---SLIDE---`、高管摘要、Mermaid、部署/env 附录 |
| [master-checklist.md](./master-checklist.md)          | **总体规划执行清单**：已完成项用删除线标记，随迭代更新                    |
| [v0-ui-reference/README.md](./v0-ui-reference/README.md) | **UI 参考 v2.0**：七模块 + 沉浸编辑器 + 模型选择器 + 设置 demo；渐进迁入 `src/` |


**维护约定**：总体规划或路线图变更时，同步检查本目录是否需增删小节；Schema 变更时同步 `docs/技术说明.md`。