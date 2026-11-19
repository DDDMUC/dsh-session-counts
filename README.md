# dsh-session-counts

在 DSH Web 侧边栏显示会话数量：每个工作区（文件夹）行尾一个计数，「工作区」标签旁一个总数。

## 显示什么

- **文件夹行**：行尾一个 11px 灰色数字，位置在标题右侧、悬停按钮左侧。
- **表头**：`工作区` 标签后面一个同款数字，表示所有文件夹（含未分组）会话数之和。

## 统计口径

| 规则 | 行为 |
|---|---|
| 已归档筛选 | 跟随侧边栏「筛选会话」的当前选择：隐藏已归档 / 全部对话 / 仅显示已归档 |
| 空会话 | 不算（还没发言的「新会话」占位行） |
| 子代理会话 | 不算 |
| 折叠的工作区 | 算（按数据统计，不按可见行统计） |
| 未分组 | 单独计数，并计入表头总数 |

## 它是怎么做的

侧边栏没有为文件夹行和表头提供插槽，所以这个插件注册在官方的 `shell.overlay` 上，做两件事：

1. 读 `useWorkspaces()` 的 `items`（每个工作区带 `sessionIds`）与 `archivedSessionIds`，结合 `useSessions()` 的元数据算出每个工作区的可见会话数；
2. 读取侧边栏持久化的 `archivedFilter`（`localStorage` 的 `dsh.workspace.view.v5`），让计数和筛选口径一致。

数字不插入任何节点，而是写成属性：

- 文件夹行：`[data-row-key^="workspace:"]` 上的 `data-dsh-count`，由 CSS `::after` 渲染；
- 表头标签：`[class*="_sectionLabel"]` 上的 `data-dsh-total`，同样由 `::after` 渲染。

这样 React 重渲染不会把多余的子节点留在 DOM 里（早先的版本插 `<span>`，结果标签左右各出现一个数字）。

筛选切换靠 1 秒一次的 `localStorage` 轮询加 DOM 变更观察触发重绘。

## 已知限制

- 依赖 CSS Module 的**局部类名后缀**（`_sectionLabel`、`_sectionHeader`）和业务键 `data-row-key`，不依赖每次构建都会变的哈希前缀；产品大改结构时可能需要跟着调一次。
- 计数刷新是「变更驱动 + 1 秒兜底」，极快的筛选切换可能滞后一拍。

## 安装

从 npm：

```bash
dsh plugin --profile <name> add dsh-session-counts
```

从 GitHub 源码安装：

```bash
dsh plugin --profile <name> add https://github.com/DDDMUC/dsh-session-counts
```

或在 DSH 的插件管理界面里选择从本地目录安装，指向本仓库根目录。

安装后刷新页面即可看到计数。

## 许可

MIT，见 [LICENSE](LICENSE)。
