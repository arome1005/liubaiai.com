# RAG 索引设计（§11 步 23～24 · Living）

> **现状（MVP）**：写作侧栏 **RAG** 支持 **参考库**（持久倒排）与 **本书锦囊导出 / 本书正文**（**运行时** 分块 + `refineHybridHit`，见 `src/util/work-rag-runtime.ts`）；`AiPanel` 多源勾选、top-k、隐私 `allowRagSnippets`、装配器注入（见 `assemble-context` RAG 块）。  
> **可选二期**：本书锦囊 / 正文 **持久倒排表** 与 **向量层**（与参考库同构索引），用于超大书性能优化。

## 1. 参考库（已实现）


| 项     | 说明                                                     |
| ----- | ------------------------------------------------------ |
| 切块    | `REFERENCE_CHUNK_CHAR_TARGET` 量级分块写入 `referenceChunks` |
| 更新    | 导入 / 替换正文时重建该书倒排与块                                     |
| 检索    | 字面量 AND + `hybrid` OR 加权（步 40）                         |
| 与进度游标 | 侧栏可选「仅进度前」类门控在 **装配输入** 侧组合，非索引表新列                     |


## 2. 本书锦囊 / 正文（MVP：运行时检索）


| 来源     | 现状           | 说明                                                                                 |
| ------ | ------------ | ---------------------------------------------------------------------------------- |
| 本书锦囊各表 | **已接侧栏 RAG** | 与全书导出同源聚合为 Markdown 后 **运行时切块**（`WORK_RAG_CHUNK_CHAR_TARGET`），混合打分；无持久 `postings`。 |
| 章节正文   | **已接侧栏 RAG** | 仅 **进度游标及之前** 章节；**排除当前编辑章**；块池有上限（见 `work-rag-runtime.ts`）。                       |


**持久倒排索引（可选二期）**：锦囊页保存 / `updateChapter` 成功后异步增量建索引，可与参考库共用 posting 结构、不同 `source`。

**向量（可选二期）**：`ReferenceChunk.embeddings` 已预留字段；本地可先 **BM25/字面量** 再评估 `transformers.js` / 服务端 embedding 成本。

## 3. 装配器写入（步 24）

- 保持 **top-k**、**maxContextChars** 截断、**隐私 allowRagSnippets** 与现网一致。  
- 多源命中：**参考库 → 本书锦囊块 → 本书正文块** 顺序拼接，再整体 `slice(0, top-k)`；各源配额按勾选源数 **均分余数**（见 `allocateSlots`）。

---

**验收**：本文件为 **步 23** 设计真源；**步 24** 以 `master-checklist` §B + 代码 `AiPanel` / `assemble-context` 划线为准。