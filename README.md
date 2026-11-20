# dsh-session-counts

在 DSH Web 侧边栏显示会话数量：每个工作区（文件夹）行尾一个 `可见数/总数`，「工作区」标签旁一个同格式的总计。

## 显示什么

- **文件夹行**：行尾一个 11px 灰色徽章，位置在标题右侧、悬停按钮左侧，形如 `7/13`。
- **表头**：`工作区` 标签后面一个同款徽章，表示所有文件夹（含未分组）的 `可见数/总数`。

## 统计口径

| 规则 | 行为 |
|---|---|
| 可见数 | 当前「筛选会话」选择下能看到的会话数（隐藏已归档 / 全部对话 / 仅显示已归档） |
| 总数 | 该工作区全部会话数，**含已归档**，不受筛选影响 |
| 空会话 | 不算（还没发言的「新会话」占位行） |
| 子代理会话 | 不算 |
| 折叠的工作区 | 算（按数据统计，不按可见行统计） |
| 未分组 | 单独计数，并计入表头总数 |

筛选为「全部对话」时两个数字相等（如 `13/13`）；「隐藏已归档」时形如 `10/13`；「仅显示已归档」时形如 `3/13`。

## 它是怎么做的

侧边栏没有为文件夹行和表头提供插槽，所以这个插件注册在官方的 `shell.overlay` 上，做两件事：

1. 读 `useWorkspaces()` 的 `items`（每个工作区带 `sessionIds`）与 `archivedSessionIds`，结合 `useSessions()` 的元数据算出每个工作区的可见数与总数；
2. 读取侧边栏持久化的 `archivedFilter`（`localStorage` 的 `dsh.workspace.view.v5`），让「可见数」和筛选口径一致。

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
