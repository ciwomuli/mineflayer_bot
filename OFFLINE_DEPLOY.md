# Docker 离线部署

## 1. 在可联网的构建机上打包

Windows 构建机先启动 Docker Desktop，在项目目录打开 PowerShell：

```powershell
.\build-offline-package.ps1
```

Linux 构建机在项目目录执行：

```bash
chmod +x build-offline-package.sh
./build-offline-package.sh
```

默认生成 Linux x86_64 镜像及压缩包：

```text
dist/mineflayer-bot-offline.tar.gz
```

如果服务器是 ARM64：

```powershell
.\build-offline-package.ps1 -Platform linux/arm64 -BundleName mineflayer-bot-arm64-offline
```

Linux 下对应命令为：

```bash
./build-offline-package.sh --platform linux/arm64 --bundle mineflayer-bot-arm64-offline
```

首次构建需要联网下载 Node 基础镜像和 npm 依赖。生成的离线包已包含 Docker 镜像、Compose 配置、运行配置和数据目录。

## 2. 复制到离线 Linux 服务器

通过 U 盘、内网 SCP 等方式复制压缩包，然后执行：

```bash
tar -xzf mineflayer-bot-offline.tar.gz
cd mineflayer-bot-offline
sh deploy-offline.sh
```

服务器必须预先安装 Docker Engine 和 Docker Compose v2，但部署过程不需要访问镜像仓库或 npm。

## 3. 离线修改配置并重启

`config.js` 从宿主机挂载到容器，修改它不需要重新构建镜像：

```bash
vi config.js
docker compose restart
docker compose logs -f --tail=100
```

修改 JavaScript 源代码则必须在构建机重新运行打包脚本，再把新压缩包传到服务器并执行部署脚本。导入同名镜像后，运行 `docker compose up -d --force-recreate --no-build --pull never` 可重建容器。

## 常用命令

```bash
docker compose ps
docker compose logs -f --tail=100
docker compose restart
docker compose down
```

`data/`、`syncmatica/` 和 `placements.json` 都是宿主机挂载的数据；删除容器不会删除这些文件。`config.js` 可能包含登录密码，请只通过安全介质传输，并限制离线包的读取权限。
