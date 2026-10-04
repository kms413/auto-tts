# auto-tts

基于 [edge-tts](https://github.com/rany2/edge-tts) 的无限量文本转语音工具。输入文本，挑一个音色和语气，队列会把它们合成成 mp3，可在线试听和下载。

不需要 API Key，不按字数收费，长文本和批量任务都能排队处理。

## 安装

先确认本机有 Node.js 和 Python：

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 18 或更高 | 运行 `auto-tts` 命令 |
| Python | 3.9 或更高 | 后端运行时 |

然后全局安装：

```bash
npm i -g auto-tts
```

## 启动

```bash
auto-tts web
```

首次启动会在 `~/.local/share/auto-tts/venv` 建一个独立的 Python 环境并安装后端依赖（只需一次）。等服务就绪后，它会自动打开浏览器，并在终端打印网页地址：

```
http://127.0.0.1:8000
```

按 `Ctrl+C` 停止服务。

Debian / Ubuntu 上如果提示无法创建虚拟环境，需要先装 `python3-venv`：

```bash
sudo apt install python3-venv
```

### 常用参数

```bash
auto-tts web --port 9000     # 换一个端口（默认 8000）
auto-tts web --host 0.0.0.0  # 允许局域网内其它设备访问
auto-tts web --no-open       # 不自动打开浏览器
auto-tts web --reset         # 重建 Python 环境后启动
auto-tts --help              # 查看全部用法
auto-tts --version           # 查看版本
```

## 功能

- **音色**：322 个 edge-tts 音色，可按语言区域或名称筛选
- **语气**：自然、温柔、愉悦、兴奋、严肃、悲伤、新闻播报、低语，另有自定义
- **长文本**：自动分块合成，长度不限
- **批量队列**：用空行分隔多段文本，每段成为一个独立任务
- **任务面板**：实时进度、失败原因、试听、下载 mp3

### 关于语气

edge-tts 本身**不支持**真正的情感风格（微软服务端会拒绝 `<mstts:express-as>` 一类的请求），所以这里的语气是用**语速、音调、音量**三个参数组合近似出来的预设。选中预设会自动填写这三个滑块，手动拖动任一滑块则切回「自定义」。所有预设定义在 [`backend/app/tts.py`](backend/app/tts.py) 的 `TONE_PRESETS`。

## 数据存放位置

生成内容和运行环境都放在用户目录，不会写进 node_modules：

```
~/.local/share/auto-tts/
├── venv/                 # Python 虚拟环境
├── data/audio/           # 生成的 mp3
└── requirements.sha256   # 依赖指纹，用于判断是否需要重装
```

`requirements.txt` 改动后，下次启动会自动识别并重装依赖。

## 从源码运行

如果你想改代码，把仓库克隆下来：

```bash
git clone https://github.com/kms413/auto-tts.git
cd auto-tts
./start.sh          # 建 venv、装依赖、构建前端、单端口启动
./start.sh --dev    # 开发模式：后端热重载 + Vite 开发服务器
./start.sh --rebuild
```

`./start.sh` 与 `auto-tts web` 效果一致，区别是使用仓库内的 `.venv` 和源码构建产物。

## HTTP 接口

服务同时托管页面和 API，全部挂在同一个端口下：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/voices` | 全部可用音色 |
| GET | `/api/tones` | 语气预设及其对应的语速/音调/音量 |
| POST | `/api/jobs` | 创建任务，`text` 单条或 `texts` 批量 |
| GET | `/api/jobs` | 任务列表 |
| GET | `/api/jobs/{id}` | 单个任务 |
| DELETE | `/api/jobs/{id}` | 删除任务 |
| GET | `/api/audio/{filename}` | 获取音频文件 |

## 技术栈

- 后端：FastAPI + edge-tts，任务队列为进程内异步队列
- 前端：React + TypeScript + Vite

## 许可

GNU Affero General Public License v3.0 或更新版本（AGPL-3.0-or-later），完整条款见 [LICENSE](LICENSE)。

Copyright (C) 2026 kms413

AGPL 第 13 条要求以网络方式提供服务的程序向用户提供获取源代码的途径，因此页面底部保留了「获取源代码」链接，请勿移除。