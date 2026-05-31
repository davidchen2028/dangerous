# 极危行动 — 联机大厅

暗色行动基地背景 + **联机大厅**（WebSocket）。

## 功能

- 昵称进入、**房间号**（相同房间才能一起玩）
- 右上角 **在线玩家列表**
- 右下角 **聊天**
- **仓库 6×10**：左侧身上装备栏 + 右侧储物格，市场购入先入仓库
- **聊天 & 在线列表**：同房间可见

## 运行（联机）

见 **`复制到终端.txt`**，或：

```bash
cd "/Users/admin/project/david/极危/极危行动"
./run.sh
```

本机：**http://localhost:8080**

### 和好友联机

1. 主机运行 `./run.sh`（`--host 0.0.0.0` 已开启局域网）
2. 查本机 IP：`ipconfig getifaddr en0` 或 `./get-ip.sh`
3. 好友浏览器打开 `http://你的IP:8080`（也可用 `PORT=8082 ./run.sh` 换端口）
4. **房间号一致**（默认 `main`）

### 手机能用吗？

**可以。** 与电脑是**同一个网页**，已做手机适配：

| 设备 | 用法 |
|------|------|
| **电脑** | Chrome / Safari 打开 `http://localhost:端口` |
| **手机（同一 WiFi）** | Safari / Chrome 打开 `http://电脑IP:端口` |
| **操作** | 点「房间」「仓库」；右上角 × 返回；输入框字号已防 iOS 放大 |

注意：须先在本机运行 `./run.sh`，手机不能只打开 html 文件。

## 仅静态页（不联机）

```bash
python3 -m http.server 8080
```

（无在线列表/聊天/仓库同步）

## 结构

```
极危行动/
├── index.html
├── css/lobby.css
├── js/stash.js, net.js
├── server/app.py      # Flask + Socket.IO
├── run.sh
└── 复制到终端.txt
```
