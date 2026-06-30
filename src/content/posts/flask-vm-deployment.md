---
title: Flask 项目在 Ubuntu 26.04 与 CentOS 7 两种虚拟机上的运行复盘
published: 2026-06-22
description: "记录将一个依赖 pandas/numpy 的 Flask 项目部署到两台 Linux 虚拟机上的完整排障过程——Ubuntu 太新导致依赖不兼容，CentOS 太旧导致编译失败，核心教训是为项目创建独立运行环境而非依赖系统默认 Python。"
tags: [Flask, Python, Linux, Ubuntu, CentOS, 运维, 虚拟环境, 排障]
category: 开发记录
draft: false
---

今天的目标是把一个 Flask 项目 `xhs-WeatherForecastSystem` 放到虚拟机中运行，并能从宿主机浏览器访问。项目依赖 `pandas`、`numpy` 等科学计算包，因此整个过程不仅涉及文件上传和 SSH 连接，还涉及 Python 版本、虚拟环境、依赖安装、系统编译环境等问题。

两台虚拟机的问题完全不同：Ubuntu 26.04 的问题是系统太新，默认 Python 3.14 版本过高；CentOS 7 的问题是系统太老，默认 Python 只有 2.7.5，GCC 也只有 4.8.5。

最终形成的核心经验是：**不要直接使用系统默认 Python 跑项目，应该为项目创建独立的 Python 虚拟环境，并根据系统环境选择合适的 Python 和依赖版本。**

## 一、连接与上传

虚拟机 IP `192.168.17.129`，用户 `hutao`。从 Windows PowerShell 连接：

```powershell
ssh hutao@192.168.17.129
```

通过 `scp` 上传项目：

```powershell
scp -r E:\MyProjects\xhs-WeatherForecastSystem hutao@192.168.17.129:/home/hutao/
```

注意 Linux 用户家目录是 `/home/用户名`，不是 `/hutao/home`。

## 二、Ubuntu 26.04：Python 太新导致依赖不兼容

### `python` 命令不存在

Ubuntu 中默认命令叫 `python3`，不提供 `python`。如果缺少 venv 模块：

```bash
sudo apt update
sudo apt install python3-venv python3-pip -y
```

创建虚拟环境：

```bash
python3 -m venv venv
source venv/bin/activate
```

### pandas 在 Python 3.14 下编译失败

安装依赖时报错：

```text
error: metadata-generation-failed
aggregations.cpython-314-x86_64-linux-gnu.so
/usr/include/python3.14
```

核心原因：Ubuntu 26.04 默认 Python 3.14 太新，项目依赖中的 pandas 版本不适配。

### 使用 uv 安装 Python 3.12

系统源里没有 `python3.12`，改用 `uv`：

```bash
sudo apt install curl -y
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

cd ~/xhs-WeatherForecastSystem
rm -rf venv
uv venv --python 3.12 venv
source venv/bin/activate
python --version  # Python 3.12.13
```

### 虚拟环境没有 pip

uv 创建的环境未自带 pip，且裸用 `pip` 调到了系统 pip 触发 `externally-managed-environment` 错误。直接用 `uv pip`：

```bash
uv pip install pip setuptools wheel -i https://pypi.tuna.tsinghua.edu.cn/simple
uv pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### Flask 无法从宿主机访问

Flask 默认监听 `127.0.0.1`，虚拟机里的 127.0.0.1 只代表虚拟机自己。正确启动：

```bash
python -m flask --app app run --host=0.0.0.0 --port=5000
```

宿主机浏览器访问 `http://192.168.17.129:5000`。如果打不开，检查防火墙：

```bash
sudo ufw allow 5000
```

## 三、SSH 免密登录与昵称

Windows 本机已有 SSH 密钥，将公钥写入虚拟机：

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh hutao@192.168.17.129 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

编辑 `~/.ssh/config`：

```sshconfig
Host ubuvm
    HostName 192.168.17.129
    User hutao
    IdentityFile C:\Users\27316\.ssh\id_ed25519
```

之后直接 `ssh ubuvm` 即可连接。

## 四、CentOS 7：系统太老导致编译失败

### 默认 Python 是 2.7.5

CentOS 7 的 `yum` 依赖系统 Python 2.7，**不能**把 `/usr/bin/python` 替换成 Python 3，否则系统包管理器会损坏。正确做法是保留系统 Python 2.7，单独为项目安装 Python 3。

### 安装 uv

```bash
sudo yum install -y curl ca-certificates tar gzip
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

### 上传路径问题

`scp` 上传后项目内容直接进入了 `/home/root`，没有保留最外层文件夹名。确认真实路径用：

```bash
find / -type d -name "xhs-WeatherForecastSystem" 2>/dev/null
```

### numpy 编译失败

CentOS 7 的 GCC 只有 4.8.5，而新版本 NumPy 要求 GCC ≥ 9.3：

```text
C compiler for the host machine: cc (gcc 4.8.5)
ERROR: NumPy requires GCC >= 9.3
```

即使切换到 Python 3.11，依赖解析器仍选择了 `numpy==2.4.6`，源码编译照样失败。

### 约束 numpy 版本

用 constraints 文件强制指定兼容版本：

```bash
cat > constraints.txt <<'EOF'
numpy==1.26.4
pandas==2.2.2
EOF
```

优先使用预编译 wheel，禁止源码编译：

```bash
uv pip install "numpy==1.26.4" "pandas==2.2.2" --only-binary=:all: -i https://pypi.tuna.tsinghua.edu.cn/simple
uv pip install -r requirements.txt -c constraints.txt --only-binary=:all: -i https://pypi.tuna.tsinghua.edu.cn/simple
```

`--only-binary=:all:` 的含义是只允许安装预编译 wheel，不允许源码编译——这直接规避了 CentOS 7 老 GCC 的问题。

## 五、两种环境的问题对比

| 环境 | 主要问题 | 根因 | 解决思路 |
|------|----------|------|----------|
| Ubuntu 26.04 | pandas 在 Python 3.14 下编译失败 | 系统 Python 太新，依赖不适配 | uv 创建 Python 3.12 虚拟环境 |
| Ubuntu 26.04 | venv 中没有 pip | uv 创建的环境未自带 pip | 使用 `uv pip` 替代裸 pip |
| Ubuntu 26.04 | Flask 只能本机访问 | 监听 `127.0.0.1` | `--host=0.0.0.0` |
| CentOS 7 | 默认 Python 2.7.5 | 系统过旧，yum 依赖 Python 2 | 不覆盖系统 Python，单独创建 venv |
| CentOS 7 | numpy 2.x 编译失败 | GCC 4.8.5 太旧 | constraints 降级 + `--only-binary` |

## 六、最终推荐命令

### Ubuntu 26.04

```bash
cd ~/xhs-WeatherForecastSystem
rm -rf venv

curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

uv venv --python 3.12 venv
source venv/bin/activate

uv pip install pip setuptools wheel -i https://pypi.tuna.tsinghua.edu.cn/simple
uv pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

python -m flask --app app run --host=0.0.0.0 --port=5000
```

### CentOS 7

```bash
cd /root/xhs-WeatherForecastSystem
rm -rf venv

export PATH="$HOME/.local/bin:$PATH"
uv venv --python 3.11 venv
source venv/bin/activate

cat > constraints.txt <<'EOF'
numpy==1.26.4
pandas==2.2.2
EOF

uv pip install "numpy==1.26.4" "pandas==2.2.2" --only-binary=:all: -i https://pypi.tuna.tsinghua.edu.cn/simple
uv pip install -r requirements.txt -c constraints.txt --only-binary=:all: -i https://pypi.tuna.tsinghua.edu.cn/simple

python -m flask --app app run --host=0.0.0.0 --port=5000
```

## 七、总结

这次部署最大的收获不是某一条命令，而是环境管理思路。

**第一，不要随便替换系统 Python。** Ubuntu、CentOS 都有自己的系统 Python 依赖，尤其是 CentOS 7，`yum` 依赖 Python 2.7，不能直接把 `/usr/bin/python` 改成 Python 3。

**第二，项目应该使用独立虚拟环境。** 不同项目需要不同 Python 版本和依赖版本，使用 `uv venv` 可以把项目环境和系统环境隔离开。

**第三，系统太新和太旧都会出问题。** Ubuntu 26.04 的 Python 3.14 太新导致旧依赖不兼容；CentOS 7 的 GCC 4.8.5 太旧导致新依赖无法编译。两个方向的兼容性问题，解决思路都是在目标系统上构造一个合适的独立运行环境。

**第四，科学计算包优先用 wheel，不要源码编译。** 源码编译对 GCC、glibc、Python 头文件等系统依赖要求很高，尤其不适合 CentOS 7 这种老系统。`--only-binary=:all:` 直接切断源码编译路径。

**第五，Flask 在虚拟机里要监听 `0.0.0.0`。** 127.0.0.1 只在虚拟机内部可达，宿主机访问必须绑定所有接口。

**第六，上传文件后不要凭感觉猜目录。** 用 `pwd`、`ls`、`find` 确认真实路径——虚拟机里的文件系统结构不一定和宿主机一样。
