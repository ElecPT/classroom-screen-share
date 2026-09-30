# 课堂投屏互动系统

教师端展示最多六个学员卡位，学生可通过网页提交文字或图片。使用 Node.js、Express 和 Socket.IO。

## 本地运行

```sh
npm ci
npm start
```

- 教师端：http://localhost:9123
- 学生端：http://localhost:9123/student.html

手机演示时，请与电脑连接同一个 Wi-Fi，并使用电脑的局域网 IP 替换 localhost。防火墙需允许对应端口连接。

默认端口为 9123，可通过 `PORT` 环境变量修改。`PUBLIC_URL` 可指定二维码使用的外部地址；本地运行时留空。程序读取进程环境变量，不会自动加载 `.env` 文件。

## 部署

可参考 `README-宝塔部署.md` 中的原部署示例，将域名和目录替换为自己的配置，并在反向代理中启用 WebSocket。

仓库不包含用户上传的图片，`uploads/` 会在运行时自动创建。课堂卡位状态保存在内存中，服务重启后清空。