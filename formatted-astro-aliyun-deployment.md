# 从 `git push` 到自动上线：为 Astro 博客搭建 GitHub Actions → 阿里云 ECS 自动部署

以前更新博客时，流程通常是这样的：

```text
本地修改
↓
git push
↓
SSH 登录服务器
↓
上传 dist
↓
覆盖旧文件
↓
检查 Nginx
```

步骤并不复杂，但每次发布都重复执行，时间久了会非常机械。

这次我把 `furinafans.com` 的发布流程改造成了一套最小化 CI/CD：

```text
git push origin master
        ↓
GitHub Actions
        ↓
pnpm install
        ↓
pnpm run build
        ↓
生成 dist/
        ↓
SSH + rsync
        ↓
阿里云 ECS
/var/www/Furinafans/
        ↓
Nginx
        ↓
furinafans.com
```

现在只要代码被 push 到 `master`，博客就会自动构建并部署到阿里云。

---

## 一、先搞清楚：我们监听的并不是 `origin/master`

最开始我的想法是：

> 怎么监听 `origin/main`，只要我一 push 就自动部署？

这里其实混淆了两个概念。

`origin/master` 是本地 Git 中的一个远程跟踪引用：

```text
本地仓库
master

远程跟踪引用
origin/master
```

GitHub Actions 并不会去“监听 `origin/master`”。

真正发生的是：

```text
git push origin master
        ↓
GitHub 上的 master 分支发生 push 事件
        ↓
GitHub Actions 收到 push event
```

所以 Workflow 中写的是：

```yaml
on:
  push:
    branches:
      - master
```

而不是：

```yaml
origin/master
```

另外，我一开始还误以为项目主分支叫 `main`。

检查：

```powershell
git branch --show-current
```

结果：

```text
master
```

再检查远程：

```powershell
git branch -r
```

结果：

```text
origin/master
upstream/HEAD -> upstream/master
upstream/master
```

所以最终 Deployment Workflow 应该监听：

```yaml
branches:
  - master
```

这个小检查很重要，否则 Workflow 写得再正确，也根本不会触发。

---

## 二、确认服务器真正的网站目录

在开始自动部署前，首先得弄清楚：

> Nginx 到底在读取哪个目录？

服务器执行：

```bash
nginx -T 2>/dev/null | grep -nE 'server_name|root '
```

得到：

```text
server_name furinafans.com www.furinafans.com;
root /var/www/Furinafans;
```

所以最终部署目标非常明确：

```text
GitHub Actions 构建出的 dist/
                ↓
/var/www/Furinafans/
```

检查目录：

```bash
ls -lah /var/www/Furinafans
```

里面已经是标准 Astro 静态构建产物：

```text
index.html
404.html
_astro/
posts/
assets/
pagefind/
rss.xml
sitemap-index.xml
...
```

因此这里不需要在阿里云服务器上保存源码，也不需要让服务器自己执行：

```bash
git pull
pnpm install
pnpm build
```

服务器只负责：

```text
接收静态文件 + Nginx 提供服务
```

职责非常干净。

---

## 三、确认 Astro 的构建输出目录

本地执行：

```powershell
pnpm run build
```

然后：

```powershell
Get-ChildItem
```

项目根目录下存在：

```text
dist/
```

说明 Astro 的生产构建产物就是：

```text
dist/
```

因此 CI/CD 的核心其实只有一句：

```text
把 GitHub Actions 中生成的 dist/
同步到
阿里云 /var/www/Furinafans/
```

---

## 四、为什么不用 root 直接部署

最省事的办法当然是：

```text
GitHub Actions
↓
root@服务器
```

但这样权限过大。

GitHub Actions 真正需要的能力只有：

```text
登录服务器
+
写入网站目录
```

它并不需要：

```text
修改系统配置
安装软件
管理用户
重启系统
访问整个 /root
```

所以创建专用账号：

```bash
adduser deploy
```

Nginx 使用的用户则通过：

```bash
grep -n '^user' /etc/nginx/nginx.conf
```

确认是：

```text
www-data
```

于是形成了明确的职责划分：

```text
deploy
负责发布文件

www-data
负责 Nginx 读取文件
```

把网站目录交给部署用户：

```bash
chown -R deploy:www-data /var/www/Furinafans
```

目录权限：

```bash
find /var/www/Furinafans -type d -exec chmod 775 {} \;
```

文件权限：

```bash
find /var/www/Furinafans -type f -exec chmod 664 {} \;
```

最终确认：

```bash
ls -ld /var/www/Furinafans
ls -l /var/www/Furinafans/index.html
```

类似：

```text
drwxrwxr-x deploy www-data /var/www/Furinafans
-rw-rw-r-- deploy www-data index.html
```

然后使用 `deploy` 用户实际测试：

```bash
touch /var/www/Furinafans/deploy-test.txt
```

成功创建，说明 GitHub Actions 未来也具备写入能力。

测试结束后删除：

```bash
rm /var/www/Furinafans/deploy-test.txt
```

---

## 五、为 GitHub Actions 单独生成一把 SSH Key

不要直接把日常使用的服务器私钥塞给 GitHub Actions。

单独生成：

```powershell
ssh-keygen `
  -t ed25519 `
  -C "furinafans-github-actions" `
  -f "$HOME\.ssh\furinafans_github_actions"
```

得到：

```text
furinafans_github_actions
furinafans_github_actions.pub
```

两者性质完全不同：

```text
furinafans_github_actions
私钥
→ GitHub Actions 保存

furinafans_github_actions.pub
公钥
→ 阿里云 deploy 用户保存
```

这里我还踩了一个很典型的坑。

第一次生成密钥时，我还停留在阿里云 Shell 中，却执行了 Windows 命令：

```bash
ssh-keygen ... -f "$HOME\.ssh\..."
```

于是 Linux 把反斜杠当成普通字符，生成了奇怪的文件：

```text
/root\.ssh\furinafans_github_actions
```

后来删除错误文件，退出服务器，重新回到：

```text
PS E:\Furinafans>
```

才正确生成 Windows 本地密钥。

这也是一个很基础但很容易在多终端切换时犯的错误：

```text
root@server:~#
这是 Linux

PS E:\Furinafans>
这是 Windows PowerShell
```

执行命令前先看一眼提示符，能省不少时间。

---

## 六、把公钥交给 deploy 用户

公钥要写进：

```text
/home/deploy/.ssh/authorized_keys
```

之后设置权限：

```text
/home/deploy/.ssh
700

authorized_keys
600
```

并确保所有者是：

```text
deploy:deploy
```

完成后，本地测试：

```powershell
ssh `
  -i "$HOME\.ssh\furinafans_github_actions" `
  -l deploy `
  furinafans
```

成功后提示符变成：

```text
deploy@xxxx:~$
```

这一步非常关键。

它证明：

```text
这把 SSH Key
+
deploy 用户
+
服务器 SSH 配置
```

已经完全打通。

GitHub Actions 只是以后替代我的 Windows 电脑使用同一套身份认证。

---

## 七、GitHub Repository Secrets

接下来需要让 GitHub Actions 知道：

```text
服务器在哪里
使用什么用户
使用哪把 SSH 私钥
如何确认服务器身份
```

所以创建四个 Repository Secrets：

```text
ALIYUN_HOST
ALIYUN_USER
ALIYUN_SSH_KEY
ALIYUN_KNOWN_HOSTS
```

其中：

### `ALIYUN_HOST`

填写服务器公网 IP：

```text
<ALIYUN_PUBLIC_IP>
```

不要使用自己 `.ssh/config` 里的：

```text
furinafans
```

因为这个只是我 Windows 本地定义的 SSH Alias，GitHub Runner 根本不知道它是什么。

---

### `ALIYUN_USER`

填写：

```text
deploy
```

---

### `ALIYUN_SSH_KEY`

填写：

```text
furinafans_github_actions
```

这个文件的完整私钥内容。

一定不是：

```text
furinafans_github_actions.pub
```

私钥类似：

```text
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

这个内容永远不应该提交进 Git 仓库。

---

### `ALIYUN_KNOWN_HOSTS`

它用于解决 SSH 的服务器身份验证问题。

也就是说，当 GitHub Actions 连接：

```text
<ALIYUN_PUBLIC_IP>
```

时，需要提前知道：

> 我应该看到哪一个 SSH Host Key？

否则 SSH 会拒绝无人值守连接。

后面第一次部署失败，也正是因为这里出了问题。

---

## 八、最终的 GitHub Actions Workflow

项目本身已经存在：

```text
.github/workflows/
```

我新建：

```text
.github/workflows/deploy-aliyun.yml
```

最终版本如下：

```yaml
name: Deploy to Aliyun

on:
  push:
    branches:
      - master
  workflow_dispatch:

concurrency:
  group: furinafans-aliyun-production
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest

    permissions:
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.22.0
          run_install: false

      - name: Install dependencies
        run: pnpm install --no-frozen-lockfile

      - name: Build site
        run: pnpm run build

      - name: Configure SSH
        env:
          SSH_PRIVATE_KEY: ${{ secrets.ALIYUN_SSH_KEY }}
          SSH_KNOWN_HOSTS: ${{ secrets.ALIYUN_KNOWN_HOSTS }}
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh

          printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519

          printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 644 ~/.ssh/known_hosts

      - name: Deploy to Aliyun
        env:
          ALIYUN_HOST: ${{ secrets.ALIYUN_HOST }}
          ALIYUN_USER: ${{ secrets.ALIYUN_USER }}
        run: |
          rsync -az --delete \
            --chmod=D755,F644 \
            dist/ \
            "$ALIYUN_USER@$ALIYUN_HOST:/var/www/Furinafans/"
```

---

## 九、为什么这里使用 rsync

理论上也可以：

```bash
scp -r dist/* server:/var/www/Furinafans/
```

但静态站点部署更适合 `rsync`。

核心命令：

```bash
rsync -az --delete \
  --chmod=D755,F644 \
  dist/ \
  "$ALIYUN_USER@$ALIYUN_HOST:/var/www/Furinafans/"
```

其中：

```text
-a
archive mode

-z
传输时压缩

--delete
删除服务器上已经不存在于新 dist 中的旧文件

--chmod=D755,F644
目录设为 755
文件设为 644
```

`--delete` 尤其重要。

例如旧版本有：

```text
_astro/old-script.js
```

新版本已经不再生成它。

如果只是不断覆盖：

```text
dist → server
```

旧文件可能永远残留。

而：

```bash
rsync --delete
```

会让服务器目录更接近：

```text
当前 dist 的镜像
```

对于哈希静态资源尤其合适。

---

## 十、为什么不在阿里云服务器上 build

另一种常见方案是：

```text
GitHub Actions
↓
SSH
↓
cd /project
git pull
pnpm install
pnpm build
```

这种方式也能工作。

但它意味着生产服务器需要：

```text
Git
Node.js
pnpm
源码
node_modules
GitHub 仓库访问凭证
构建工具链
```

而现在采用的是：

```text
GitHub Actions
负责源码和构建

阿里云
只保存最终 dist
```

所以生产环境只需要：

```text
Nginx
静态文件
SSH
rsync
```

这是一种更清晰的关注点分离：

```text
Build environment
≠
Runtime environment
```

对于纯静态 Astro 网站来说尤其合理。

---

## 十一、第一次 push：四个 Workflow 一起启动了

正式提交：

```powershell
git commit -m "ci: add Aliyun deployment workflow"
```

然后：

```powershell
git push origin master
```

GitHub Actions 页面突然出现了四条：

```text
Build and Check
Deploy to Aliyun
Deploy to GitHub Pages
Code quality
```

第一眼看起来很像：

> 怎么部署一次炸出来四个任务？

实际上不是。

这是因为仓库原本已经存在多个 Workflow：

```text
.github/workflows/build.yml
.github/workflows/biome.yml
.github/workflows/deploy.yml
.github/workflows/deploy-aliyun.yml
```

它们都监听：

```yaml
push:
  branches:
    - master
```

所以同一次：

```text
git push origin master
```

会触发多个独立 CI Workflow。

它们分别负责：

```text
Build and Check
构建检查

Code quality
Biome 等代码质量检查

Deploy to GitHub Pages
旧 GitHub Pages 发布

Deploy to Aliyun
新的阿里云发布
```

它们不是一个 Workflow 的四个阶段。

如果以后完全不再使用 GitHub Pages，可以在：

```text
GitHub
→ Actions
→ Deploy to GitHub Pages
→ ...
→ Disable workflow
```

把旧发布流程禁用。

而：

```text
Build and Check
Code quality
```

可以继续保留。

它们不会修改阿里云服务器，只是在真正发布前帮助发现问题。

---

## 十二、第一次真正失败：`Host key verification failed`

第一次执行 `Deploy to Aliyun` 时，实际上绝大多数阶段都成功了：

```text
✅ Checkout
✅ Setup Node.js
✅ Setup pnpm
✅ pnpm install
✅ pnpm run build
✅ Configure SSH
❌ Deploy to Aliyun
```

错误：

```text
Host key verification failed.

rsync: connection unexpectedly closed
rsync error: unexplained error (code 255)
```

这反而说明很多东西已经是正确的：

```text
代码拉取正常
Node 正常
pnpm 正常
Astro 构建正常
dist 正常
SSH 私钥 Secret 正常
```

故障只发生在：

```text
GitHub Runner
↓
验证阿里云服务器身份
```

最终排查发现：

```text
ALIYUN_KNOWN_HOSTS
```

这个 Secret 居然是空的。

于是 Workflow 虽然执行了：

```bash
printf '%s\n' "$SSH_KNOWN_HOSTS" > ~/.ssh/known_hosts
```

但实际生成的是一个空 `known_hosts`。

所以 SSH 面对服务器时，只能说：

```text
我不认识你。
```

然后直接拒绝连接。

---

## 十三、正确获取 SSH Host Key

Windows 上一开始尝试：

```powershell
ssh-keyscan -t ed25519 <ALIYUN_PUBLIC_IP>
```

没有得到输出。

于是换了一种更直接的方法：

```powershell
ssh furinafans "cat /etc/ssh/ssh_host_ed25519_key.pub"
```

服务器返回：

```text
ssh-ed25519 AAAA... hostname
```

然后把它转换为：

```text
<ALIYUN_PUBLIC_IP> ssh-ed25519 AAAA...
```

写入：

```text
ALIYUN_KNOWN_HOSTS
```

也就是说：

```text
Host
<ALIYUN_PUBLIC_IP>

Expected Host Key
ssh-ed25519 AAAA...
```

这样 GitHub Runner 再次连接服务器时，就能够验证：

```text
服务器身份符合预期
```

于是 SSH 校验通过。

---

## 十四、不需要重新 push，直接 Re-run

因为代码本身没有问题，只是 Secret 配置错误，所以没必要：

```text
改代码
commit
push
```

只需要在 GitHub Actions 中：

```text
Re-run jobs
```

或者：

```text
Re-run failed jobs
```

第二次执行：

```text
Deploy to Aliyun ✅
```

最终完整链路正式打通。

---

## 十五、最终的日常发布体验

以后博客开发流程基本没有任何额外负担：

```powershell
git add .
git commit -m "feat: ..."
git push origin master
```

然后 GitHub 自动完成：

```text
Checkout
↓
Node 22
↓
pnpm 11
↓
pnpm install
↓
pnpm run build
↓
dist/
↓
SSH
↓
rsync
↓
阿里云
↓
Nginx
```

我本地不需要：

```text
手动 build 再传服务器
```

服务器也不需要：

```text
git pull
pnpm install
pnpm build
```

最终就是：

```text
push = deploy
```

---

## 十六、这套方案本质上做了什么

整个方案拆开，其实只有四层。

第一层是 Git：

```text
master 是 Production Branch
```

第二层是 CI：

```text
GitHub Actions
负责安装依赖和构建
```

第三层是 CD：

```text
SSH + rsync
负责把 Artifact 发布到生产环境
```

第四层是 Runtime：

```text
Nginx
负责提供静态文件
```

因此完整模型是：

```text
Source
GitHub Repository

        ↓

Build
GitHub Actions

        ↓

Artifact
dist/

        ↓

Deploy
rsync over SSH

        ↓

Runtime
Nginx on Aliyun ECS
```

这已经是一条很标准的小型静态站点 CI/CD Pipeline。

---

## 十七、几个值得记录的坑

这次真正踩到的坑其实都很典型。

### 1. `main` 和 `master` 不要凭感觉猜

先执行：

```bash
git branch --show-current
git branch -r
```

再写 Workflow。

---

### 2. `origin/master` 不是 GitHub Actions 的监听目标

Workflow 监听的是：

```yaml
push:
  branches:
    - master
```

而不是 Git 客户端的远程跟踪引用。

---

### 3. SSH Alias 只存在于本机

我的：

```bash
ssh furinafans
```

之所以能工作，是因为本地：

```text
~/.ssh/config
```

定义了 Alias。

GitHub Actions 并不知道它。

所以 Secret 应该保存真实：

```text
Host
User
Key
```

---

### 4. 不要让 GitHub Actions 使用 root

专门创建：

```text
deploy
```

把权限限制在：

```text
/var/www/Furinafans
```

更合理。

---

### 5. 私钥和服务器 Host Key 是两回事

客户端身份：

```text
ALIYUN_SSH_KEY
```

回答：

> 我是谁？

服务器身份：

```text
ALIYUN_KNOWN_HOSTS
```

回答：

> 你连接的服务器是谁？

这两个 SSH 概念很容易混淆。

---

### 6. `Host key verification failed` 不代表私钥一定错了

这一次私钥实际上完全正确。

问题在：

```text
known_hosts
```

所以排查 SSH 时应该区分：

```text
Permission denied (publickey)
```

通常偏向客户端认证失败。

而：

```text
Host key verification failed
```

则是服务器身份验证失败。

完全不是一回事。

---

### 7. 不要一上来就 `StrictHostKeyChecking=no`

确实可以这样“解决”：

```bash
ssh -o StrictHostKeyChecking=no ...
```

但这相当于告诉 CI：

```text
不管对面是谁，都连。
```

真正合理的做法是维护：

```text
known_hosts
```

确保：

```text
GitHub Actions
只信任我指定的服务器 Host Key
```

---

## 十八、结语

最后回头看，这套东西并不复杂。

真正需要打通的只有：

```text
GitHub
  │
  │ push master
  ▼
GitHub Actions
  │
  │ pnpm run build
  ▼
dist/
  │
  │ rsync over SSH
  ▼
Aliyun ECS
  │
  │ /var/www/Furinafans
  ▼
Nginx
  │
  ▼
furinafans.com
```

但完成它之后，开发体验发生了本质变化。

以前：

```text
开发
和
发布
```

是两件事。

现在：

```text
正常完成 Git 工作流
=
完成发布
```

服务器逐渐从一个“需要人工操作的远程电脑”，变成真正意义上的：

```text
Deployment Target
```

而这大概也是第一次自己搭 CI/CD 后，最明显的感受。🔧
