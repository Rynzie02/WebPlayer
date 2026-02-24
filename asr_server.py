import os
import shutil
import subprocess
import tempfile
import json
import re
from typing import List, Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from tencent_asr import asr_process


app = FastAPI(title="Tencent ASR Bridge")

ALLOWED_ACTIONS = {
    "下一个",
    "上一个",
    "暂停",
    "播放",
    "切换静音",
    "全屏",
    "缩小屏幕",
    "退出全屏",
    "取消全屏",
    "打开频道",
    "调高音量",
    "调低音量",
    "打开频道",
    "搜索",
    "无动作",
}

LEGACY_ACTION_MAP = {
    "next": "下一个",
    "prev": "上一个",
    "pause": "暂停",
    "play": "播放",
    "toggle_mute": "切换静音",
    "fullscreen": "全屏",
    "exit_fullscreen": "退出全屏",
    "unfullscreen": "退出全屏",
    "minimize": "缩小屏幕",
    "open_channel": "打开频道",
    "volume_up": "调高音量",
    "volume_down": "调低音量",
    "search": "搜索",
    "find": "搜索",
    "unmute": "切换静音",
    "none": "无动作",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _try_convert_to_wav(src: str, dst: str) -> bool:
    try:
        subprocess.check_call(
            ["ffmpeg", "-y", "-i", src, "-ar", "16000", "-ac", "1", dst],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except Exception:
        return False


class NanobotRequest(BaseModel):
    transcript: str
    channels: List[str] = []


def _strip_ansi(text: str) -> str:
    if not text:
        return ""
    ansi_re = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")
    return ansi_re.sub("", text)


def _extract_first_json_object(text: str) -> Optional[dict]:
    if not text:
        return None

    text = text.strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", text):
        start = match.start()
        try:
            parsed, _ = decoder.raw_decode(text[start:])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            continue

    return None


def _normalize_action_payload(payload: Optional[dict]) -> dict:
    if not isinstance(payload, dict):
        return {"action": "无动作", "channel": "", "reply": "", "reason": "invalid_payload"}

    action_raw = str(payload.get("action", "无动作")).strip()
    action = LEGACY_ACTION_MAP.get(action_raw.lower(), action_raw)
    if action not in ALLOWED_ACTIONS:
        action = "无动作"

    channel = str(payload.get("channel", "")).strip()
    query = str(payload.get("query", "")).strip()
    reply = str(payload.get("reply", "")).strip()
    reason = str(payload.get("reason", "")).strip()

    # 保留 channel 仅当 action 为 打开频道；保留 query 仅当 action 为 搜索
    if action != "打开频道":
        channel = ""
    if action != "搜索":
        query = ""

    # 可选的延迟/时间字段：支持 delay_seconds（以秒为单位）和 execute_at（UNIX ms）
    delay_seconds = None
    if payload.get("delay_seconds") is not None:
        try:
            delay_seconds = float(payload.get("delay_seconds"))
        except Exception:
            delay_seconds = None
    elif payload.get("delaySeconds") is not None:
        try:
            delay_seconds = float(payload.get("delaySeconds"))
        except Exception:
            delay_seconds = None

    execute_at = None
    if payload.get("execute_at") is not None:
        try:
            execute_at = int(payload.get("execute_at"))
        except Exception:
            execute_at = None
    elif payload.get("executeAt") is not None:
        try:
            execute_at = int(payload.get("executeAt"))
        except Exception:
            execute_at = None

    return {
        "action": action,
        "channel": channel,
        "query": query,
        "reply": reply,
        "reason": reason,
        "delay_seconds": delay_seconds,
        "execute_at": execute_at,
    }


def _extract_action_fields_from_text(raw: str) -> Optional[dict]:
    if not raw:
        return None

    text = _strip_ansi(raw)

    action_match = re.search(r'"action"\s*:\s*"([^"]+)"', text)
    channel_match = re.search(r'"channel"\s*:\s*"([^"]*)"', text)
    reply_match = re.search(r'"reply"\s*:\s*"([^"]*)"', text)
    query_match = re.search(r'"query"\s*:\s*"([^\"]*)"', text)

    if not action_match and not reply_match:
        return None

    return {
        "action": action_match.group(1).strip() if action_match else "无动作",
        "channel": channel_match.group(1).strip() if channel_match else "",
        "reply": reply_match.group(1).strip() if reply_match else "",
        "query": query_match.group(1).strip() if query_match else "",
        "reason": "regex_fallback",
    }


def _run_nanobot_agent(transcript: str, channels: List[str]) -> dict:
    cleaned_transcript = (transcript or "").strip()
    if not cleaned_transcript:
        return {
            "action": {"action": "无动作", "channel": "", "reply": "", "reason": "empty_transcript"},
            "raw": "",
        }

    channels_text = "\n".join(f"- {name}" for name in channels[:200]) if channels else "- (empty)"
    prompt = (
        "你是播放器语音命令解析器。"
        "请根据用户语音转写，输出严格 JSON，不要输出任何额外文本。"
        "\n允许 action: 下一个, 上一个, 暂停, 播放, 切换静音, 全屏, 打开频道, 调高音量, 调低音量, 搜索, 无动作"
        "\n优先规则：如果用户说的话中明确包含或模糊匹配可用频道列表中的某个频道名称，优先将意图视为频道控制（action 设置为 \"打开频道\"，并在 channel 字段填入最匹配的频道名）；"
        "否则若用户话语包含 \"电影\"、\"片\" 或明显为影视片名（例如 \"我想看变形金刚\"），则视为搜索意图（action 设置为 \"搜索\"，并在 query 字段填入搜索关键词或片名）。"
        "\n如果用户是在提问（例如“现在几点了”），action 设为 无动作，并在 reply 中给出简洁中文回答。"
        "\n如果用户的语句包含时间或延迟指令（例如：\"30秒后切换到湖南卫视\"、\"半分钟后播放湖南卫视\"、\"5分钟后换到下一个频道\"），请在输出 JSON 中加入数值字段 `delay_seconds`（单位：秒，数值）。"
        "\n如果用户给出了明确的时刻（例如：\"今天晚上8点播放湖南卫视\"），也可以返回字段 `execute_at`（UNIX 毫秒时间戳）。优先返回 `delay_seconds` 以便客户端直接调度。"
        "\n输出格式示例： {\"action\":\"打开频道\",\"channel\":\"湖南卫视\",\"delay_seconds\":30} 或 {\"action\":\"搜索\",\"query\":\"变形金刚\"}"
        "\n\n可用频道列表:\n"
        f"{channels_text}"
        "\n\n用户语音:\n"
        f"{cleaned_transcript}"
    )

    proc = subprocess.run(
        ["nanobot", "agent", "-m", prompt],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )

    raw = (proc.stdout or "").strip() or (proc.stderr or "").strip()
    raw = _strip_ansi(raw)

    extracted = _extract_first_json_object(raw)
    if extracted is None:
        extracted = _extract_action_fields_from_text(raw)
    action = _normalize_action_payload(extracted)

    if extracted is None and raw and action.get("action") == "无动作" and not action.get("reply"):
        action["reply"] = raw

    if proc.returncode != 0 and action.get("action") == "无动作":
        action["reason"] = action.get("reason") or f"nanobot_exit_{proc.returncode}"

    return {
        "action": action,
        "raw": raw,
    }


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/asr")
async def recognize_audio(
    file: Optional[UploadFile] = File(default=None),
    url: Optional[str] = Form(default=None),
    engine_type: str = Form(default="16k_zh_large"),
):
    if file is None and not url:
        return JSONResponse({"error": "missing file or url"}, status_code=400)

    work_dir = tempfile.mkdtemp(prefix="asr_upload_")
    try:
        if file is not None:
            upload_name = file.filename or "recording.webm"
            input_path = os.path.join(work_dir, upload_name)
            with open(input_path, "wb") as output:
                shutil.copyfileobj(file.file, output)

            wav_path = os.path.join(work_dir, "recording_16k.wav")
            if _try_convert_to_wav(input_path, wav_path):
                result = asr_process(file_path=wav_path, engine_type=engine_type)
            else:
                result = asr_process(file_path=input_path, engine_type=engine_type)
        else:
            result = asr_process(file_url=url, engine_type=engine_type)

        return {"result": result or ""}
    except Exception as exc:
        return JSONResponse({"error": str(exc)}, status_code=500)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


@app.post("/api/nanobot/execute")
async def run_nanobot_and_get_action(req: NanobotRequest):
    try:
        result = _run_nanobot_agent(req.transcript, req.channels or [])
        return {
            "transcript": (req.transcript or "").strip(),
            "action": result["action"],
            "nanobot_raw": result["raw"],
        }
    except subprocess.TimeoutExpired:
        return JSONResponse(
            {
                "error": "nanobot timeout",
                "action": {"action": "无动作", "channel": "", "reply": "", "reason": "timeout"},
            },
            status_code=504,
        )
    except FileNotFoundError:
        return JSONResponse(
            {
                "error": "nanobot command not found",
                "action": {"action": "无动作", "channel": "", "reply": "", "reason": "nanobot_not_installed"},
            },
            status_code=500,
        )
    except Exception as exc:
        return JSONResponse(
            {
                "error": str(exc),
                "action": {"action": "无动作", "channel": "", "reply": "", "reason": "server_error"},
            },
            status_code=500,
        )
