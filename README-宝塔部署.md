# 投屏工具：宝塔部署说明

本文件夹就是需要上传到服务器的完整部署包。它是 Node.js 实时应用，不能只按纯静态站点运行。

## 1. 上传

将本部署文件夹内的全部内容上传到：

```text
/www/wwwroot/touping
```

`uploads` 必须保留，并确保运行 Node.js 项目的用户对该目录有写权限。

## 2. 创建 Node 项目

在宝塔安装“Node.js 版本管理器”，推荐使用 Node.js 18 或 20 LTS。然后在“Node 项目”中添加：

- 项目目录：`/www/wwwroot/touping`
- 启动文件：`server.js`
- 运行端口：`9123`
- 启动命令：`npm start`
- Node 环境：`production`

首次启动前，在项目目录执行：

```bash
npm ci --omit=dev
```

如果宝塔要求填写环境变量，请设置：

```text
PORT=9123
PUBLIC_URL=https://touping.vv620.com
```

## 3. 配置域名反向代理

在宝塔反向代理中填写：

- 代理名称：`touping`
- 目标 URL：`http://127.0.0.1:9123`
- 发送域名：`$host`

Socket.IO 需要 WebSocket。可把 `nginx-websocket.conf` 中的 `location /` 配置加入当前站点配置，或在宝塔反向代理设置中开启 WebSocket。

保存配置并重载 Nginx。若已启用 HTTPS，建议开启 HTTP 自动跳转 HTTPS。

## 4. 验证

- 教师端：`https://touping.vv620.com/`
- 学生端：`https://touping.vv620.com/student.html`
- 健康检查：`https://touping.vv620.com/api/health`

健康检查返回 `{"status":"ok",...}`，且教师端显示“已连接”后，即部署成功。

## 注意

- 请勿把 Windows 使用的 `start.bat`、`fix-firewall.bat` 或旧的 `node_modules` 上传到 Linux 服务器。
- 上传图片保存在 `uploads` 中。重新部署时不要覆盖或删除该目录，否则历史图片会丢失。
- 应用当前把在线卡位状态保存在内存中，因此 PM2/宝塔只能运行 1 个实例；重启进程会清空卡位状态。
