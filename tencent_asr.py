# -*- coding: utf-8 -*-
import json
import time
import os
import base64
import argparse
from tencentcloud.common import credential
from tencentcloud.common.profile.client_profile import ClientProfile
from tencentcloud.common.profile.http_profile import HttpProfile
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.asr.v20190614 import asr_client, models

def asr_process(file_path=None, file_url=None, engine_type="16k_zh_large"):
    """
    调用腾讯云ASR进行语音识别
    :param file_path: 本地音频文件路径
    :param file_url: 音频文件URL
    :param engine_type: 引擎类型，默认16k_zh
    :return: 识别结果字符串或None
    """
    try:
        # 实例化一个认证对象，入参需要传入腾讯云账户 SecretId 和 SecretKey
        # 为了保护密钥安全，建议将密钥设置在环境变量中或者配置文件中
        # 硬编码密钥到代码中有可能随代码泄露而暴露，请务必对密钥进行安全管理
        # SecretId 查看地址：https://console.cloud.tencent.com/cam/capi
        # 建议在终端设置环境变量：
        # export TENCENTCLOUD_SECRET_ID="你的SecretId"
        # export TENCENTCLOUD_SECRET_KEY="你的SecretKey"
        secret_id = os.environ.get("TENCENTCLOUD_SECRET_ID", "").strip()
        secret_key = os.environ.get("TENCENTCLOUD_SECRET_KEY", "").strip()

        if not secret_id or not secret_key:
            print("请先设置 SecretId 和 SecretKey，或者配置环境变量 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY")
            return None

        cred = credential.Credential(secret_id, secret_key)

        # 实例化一个http选项，可选的，没有特殊需求可以跳过
        httpProfile = HttpProfile()
        httpProfile.endpoint = "asr.tencentcloudapi.com"

        # 实例化一个client选项，可选的，没有特殊需求可以跳过
        clientProfile = ClientProfile()
        clientProfile.httpProfile = httpProfile

        # 实例化要请求产品的client对象,clientProfile是可选的
        client = asr_client.AsrClient(cred, "ap-shanghai", clientProfile)

        # 实例化一个请求对象,每个接口都会对应一个request对象
        req = models.CreateRecTaskRequest()
        
        # 设置调用参数
        # EngineModelType: 引擎模型类型
        # 16k_zh: 中文通用引擎。
        # 16k_zh_large：普方英大模型引擎【大模型版】。
        # 当前模型同时支持中文、英文和 27种方言 的识别，模型参数量极大，语言模型性能增强
        # 参考: https://cloud.tencent.com/document/product/1093/52097
        params = {
            "EngineModelType": engine_type,
            "ChannelNum": 1,
            "ResTextFormat": 0,
        }

        if file_path:
            if not os.path.exists(file_path):
                print(f"错误: 文件 '{file_path}' 不存在")
                return None
            
            file_size = os.path.getsize(file_path)
            if file_size > 5 * 1024 * 1024:  # 5MB
                print(f"警告: 文件 '{file_path}' 大小为 {file_size/1024/1024:.2f}MB，超过 5MB 限制。")
                print("请使用 url 参数并提供音频文件的 URL 地址 (例如上传到 COS)。")
                return None

            with open(file_path, "rb") as f:
                data = f.read()
                base64_data = base64.b64encode(data).decode("utf-8")
            
            params["SourceType"] = 1
            params["Data"] = base64_data
            print(f"正在识别本地文件: {file_path}")
        elif file_url:
            params["SourceType"] = 0
            params["Url"] = file_url
            print(f"正在识别网络文件: {file_url}")
        else:
            # 默认演示 URL
            default_url = "https://asr-audio-1300466766.cos.ap-nanjing.myqcloud.com/test16k.wav"
            params["SourceType"] = 0
            params["Url"] = default_url
            print(f"未指定输入，使用默认演示音频: {default_url}")

        req.from_json_string(json.dumps(params))

        # 发起录音文件识别请求
        resp = client.CreateRecTask(req)
        
        # 输出 json 格式的字符串回包
        print("任务创建成功，TaskId: " + str(resp.Data.TaskId))
        task_id = resp.Data.TaskId

        # 轮询任务结果
        while True:
            # 创建查询任务状态请求
            status_req = models.DescribeTaskStatusRequest()
            status_params = {
                "TaskId": task_id
            }
            status_req.from_json_string(json.dumps(status_params))

            # 查询任务状态
            status_resp = client.DescribeTaskStatus(status_req)
            
            # 获取任务状态
            task_status = status_resp.Data.StatusStr
            
            if task_status == "success":
                print("\n识别成功！结果如下：")
                print(status_resp.Data.Result)
                return status_resp.Data.Result
            elif task_status == "failed":
                print("\n识别失败！原因：")
                print(status_resp.Data.ErrorMsg)
                return None
            else:
                print(f"任务状态: {task_status}，正在处理中...")
                time.sleep(2)  # 等待2秒后重试

    except TencentCloudSDKException as err:
        print(f"腾讯云SDK异常: {err}")
        return None
    except Exception as e:
        print(f"发生错误: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Tencent Cloud ASR Test Script")
    parser.add_argument("--file", type=str, help="Path to local audio file (e.g. test.wav)")
    parser.add_argument("--url", type=str, help="URL of audio file")
    # 参考文档: https://cloud.tencent.com/document/product/1093/52097
    # 16k_zh_large: 普方英大模型引擎【大模型版】(资源包可能已耗尽)
    # 16k_zh: 中文通用引擎 (普通版，通常有免费额度)
    parser.add_argument("--engine_type", type=str, default="16k_zh_large", help="Engine Model Type (default: 16k_zh_large)")
    
    # 解析参数
    args = parser.parse_args()

    asr_process(file_path=args.file, file_url=args.url, engine_type=args.engine_type)

if __name__ == "__main__":
    main()
