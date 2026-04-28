# Claude Code Dashboard

用于查看和分析 Claude Code 任务执行轨迹的可视化面板。

## 启动

```bash
bash start.sh
```

脚本会依次启动：
- Flask 数据 API（port 8998）
- Vite 前端（port 8999）

浏览器访问 `http://localhost:8999`

## 页面结构

### 左侧：Session 列表

- 按**最后活跃时间**倒序排列，最近的 session 在最上面
- 每条显示：开始时间、持续时长、首条用户消息、事件总数
- 顶部搜索框支持模糊搜索，匹配范围包括用户消息和 Say 内容

### 中间：事件时间线

按时间顺序展示 session 的完整执行轨迹，支持按类型过滤：

| 标签 | 含义 |
|------|------|
| User | 用户输入 |
| Think | 模型内部思考 |
| Say | 模型回复 |
| Bash | 执行命令 |
| Read | 读取文件 |
| Write / Edit | 写入或修改文件 |
| WebFetch / WebSearch | 网页请求或搜索 |
| Result | 工具调用返回结果 |

过长的内容（>300 字符）默认折叠，点击「▼ Show more」展开。

### 右侧：运行摘要

- **Model**：本次 session 使用的模型（可能有多个）
- **Duration**：任务总耗时
- **Events**：事件总数
- **Thinking**：Think 事件数量
- **Tool Usage**：工具使用分布（环形图）
- **Top Files**：访问频率最高的文件

## 数据来源

自动读取 `~/.claude/projects/` 下的 `.jsonl` 文件，每 15 秒刷新一次。

## 目录结构

```
claude_dashboard/
├── start.sh        # 一键启动脚本
├── api.py          # Flask 数据 API（port 8998）
├── app.py          # 备用 Dash 版本（port 8999，独立运行）
├── frontend/       # React 前端
│   ├── src/App.jsx # 主界面
│   └── package.json
└── README.md
```

## 单独启动 API 或前端

```bash
# 仅启动 API
conda run -n claude_dashboard python api.py

# 仅启动前端（需 API 已在运行）
cd frontend && npm run dev
```

## 备用：Dash 版本

如果不想用 npm，可以直接运行 Dash 版本：

```bash
conda run -n claude_dashboard python app.py
```

同样监听 port 8999，功能一致但交互响应略慢。
