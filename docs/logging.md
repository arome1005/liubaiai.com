# 日志与隐私（留白写作）

## 默认策略

- **不向服务器上传**正文；数据在浏览器 IndexedDB（见 `docs/product.md`）。
- **默认不在日志中输出整章正文**。`ErrorBoundary` 在捕获错误时仅 `console.error(error, info)`；其中 `info` 含 React 组件栈，**不应包含用户输入的全文**（除非某子组件把正文塞进 state 名称等异常情形）。
- **诊断模式**（设置中开启，`localStorage` 键 `liubai:diagnostic`）：额外输出 `componentStack` 到控制台，便于开发排查；仍应避免在业务代码中 `console.log` 整章内容。

## 建议

- 若后续接入 AI：prompt 与返回是否落库须在隐私说明与设置中单独约定（见路线图 5.8）。
