# 阿公阿嬷呾嘀队 - 潮音TV

## 1. 方案说明 (Solution Description)

### 场景与痛点 (Scenario & Pain Points)
- **背景**: 随着数字化进程加速，大量老年人因无法适应复杂的智能设备而被“数字化遗弃”。在中国潮汕地区，这一问题因方言障碍尤为突出。
- **痛点**: 
    - 智能设备 UI 交互复杂，老人“怕按错、怕扣费”。
    - 老人听不懂简短的普通话提示，也难以用标准的命令词下达指令。
- **愿景**: **"科技不应该要求他们改变语言，而应该主动理解他们。"** 本项目致力于通过母语（潮汕话）交互和大模型意图识别，降低老人使用智能设备的门槛，让他们重新掌控智能生活。

### 目标 (Goals)
- **核心目标**: 实现“所说即所得”的语音控制体验，让老人可以用自然的潮汕方言控制电视。
- **技术突破**: 
    - **方言纠错**: 建立“特定领域 Prompt 纠错层”，解决潮汕话吞音、非标准表达的问题。
    - **模糊意图识别**: 将“太吵了”等自然语言自动映射为 `Volume_Down` 等结构化指令。
- **应用场景**: 智能家居控制、社区养老驿站终端、医疗床旁呼叫屏。

## 2. 技术与实现方式 (Technology & Implementation)

本项目采用 **端云结合** 的架构，以前端 WebPlayer 作为交互终端，后端 ASR 服务作为意图识别中枢。

### 架构概览
1.  **前端终端 (LibreTV)**:
    -   **定位**: Web 端单点直达的显示终端，运行在智能电视/机顶盒浏览器中。
    -   **基础**: 基于开源项目 `LibreTV` (Fork 自 bestK/tv) 进行二次开发。
    -   **功能**: 负责流媒体播放、界面渲染及响应后端下发的控制指令。
    -   **优势**: 抛弃传统 App 层层递进的点击逻辑，降低端侧设备算力要求。

2.  **方言交互层 (ASR Backend)**:
    -   **服务核心**: `asr_server.py` (基于 FastAPI)。
    -   **语音识别**: 集成腾讯云 ASR (`tencent_asr.py`) 进行语音转文字。
    -   **意图路由 (Intent Routing)**: 维护 `LEGACY_ACTION_MAP`，将自然语言指令映射为标准操作（如 `next`, `pause`, `fullscreen`）。
    -   **纠错机制**: (规划中) 在 ASR 后置入大模型层，针对方言特色进行语义修正。

### 技术栈 (Tech Stack)
-   **Frontend**: HTML5, JavaScript (ES Modules), CSS3 (Tailwind), React (部分组件)。
-   **Backend**: Python 3.10+ (FastAPI, Uvicorn)。
-   **Services**: Tencent Cloud ASR (语音识别)。
-   **DevOps**: Docker, Shell Scripts (`start.sh`).

### 目录结构说明
-   `index.html`: Live播放器核心代码（Web 页面与播放逻辑）
-   `LibreTV/`: VOD播放器核心代码。
-   `nanobot/`: agent核心代码。
-   `asr_server.py`: 语音识别与指令控制后端服务。
-   `tencent_asr.py`: 腾讯云 ASR 接口封装。
-   `start.sh`: 项目一键启动脚本（包含环境变量配置）。

## 3. 使用指南 (Usage Guide)

### 环境要求 (Prerequisites)
-   **OS**: Linux / macOS
-   **Python**: 3.10 或更高版本
-   **Node.js**: v16+ (用于前端构建)
-   **FFmpeg**: 用于音频格式转换 (必须安装)

### 安装步骤 (Installation)

1.  **克隆项目**:
    ```bash
    git clone <repository-url>
    cd webplayer
    ```

2.  **克隆子项目（nanobot 和 LibreTV）**:
    ```bash
    # nanobot（Git 子模块）
    # 请参照 nanobot官方github配置好nanobot（例如provider的apiKey）,确保能正确运行.
    git submodule update --init --recursive nanobot

    # LibreTV（若仓库中不包含该目录，请手动克隆）
    [ -d LibreTV ] || git clone <libretv-repository-url> LibreTV
    ```

3.  **安装 Python 依赖**:
    ```bash
    pip install -r requirements.txt
    ```

4.  **安装前端依赖**:
    ```bash
    cd LibreTV
    npm install
    cd ..
    ```

### 运行项目 (Running)

项目提供了一键启动脚本，会自动启动 ASR 服务、HTTP 服务和前端开发服务器。

1.  **配置密钥**:
    编辑 `start.sh`，填入您的腾讯云 API 密钥（`TENCENTCLOUD_SECRET_ID` 和 `TENCENTCLOUD_SECRET_KEY`）。
    *(注：生产环境建议使用环境变量注入，避免明文硬编码)*

2.  **启动服务**:
    ```bash
    chmod +x start.sh
    ./start.sh
    ```

3.  **访问应用**:
    -   启动后，浏览器访问 `http://localhost:8000` (或脚本输出的端口)。
    -   **语音控制**: 点击麦克风图标，试着说出指令（如“播放”、“暂停”、“换台”）。
    -   后台 ASR 服务将运行在 `http://localhost:8002`。

### 常用指令 (Voice Commands)
系统目前支持以下基础指令的意图识别：
-   **播放控制**: "播放", "暂停", "下一个", "上一个"
-   **音量控制**: "大声点" (调高音量), "小声点" (调低音量), "静音"
-   **屏幕控制**: "全屏", "退出全屏"
-   **导航**: "打开频道", "搜索"