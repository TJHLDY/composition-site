# 写译笔记本 · 阿里云部署说明

## 服务器信息

- 公网 IP：8.134.18.131
- 系统：Ubuntu 24.04 LTS
- 运行环境：OpenJDK 17 + MySQL 8.0
- 应用目录：`/opt/xieyi-notebook/`
  - `app.jar`：可执行 jar
  - `app.env`：环境变量（含密钥，不入库，权限 600）
  - `data/`：AI Key 加密密钥等运行时数据
  - `app.log`：运行日志
- systemd 服务：`xieyi-notebook`（开机自启、崩溃 10 秒后自动重启）
- 监听端口：80，公网地址 http://8.134.18.131/
- 数据库：MySQL，库名 `fanwenjia`，JPA `ddl-auto=update` 自动建表

## 常用运维命令

```bash
systemctl status xieyi-notebook      # 查看状态
systemctl restart xieyi-notebook     # 重启
journalctl -u xieyi-notebook -f      # 跟踪 systemd 日志
tail -f /opt/xieyi-notebook/app.log  # 跟踪应用日志
```

## 更新版本流程（本地 → 服务器）

```powershell
# 1. 本地重新打包（用 JDK17+，本项目用 C:\jdk25）
cd composition-site/server
mvn clean package -DskipTests

# 2. 上传新 jar 并重启
scp target/fanwenjia-server-0.1.0-SNAPSHOT.jar root@8.134.18.131:/opt/xieyi-notebook/app.jar
ssh root@8.134.18.131 "systemctl restart xieyi-notebook"
```

## 环境变量

见 `app.env.example`。修改后执行 `systemctl restart xieyi-notebook` 生效。

### 邮件（163 邮箱授权码）

- `COMPOSITION_MAIL_PASSWORD` 填的是 163 邮箱「客户端授权码」，不是登录密码
- 授权码在 163 邮箱网页版：设置 → POP3/SMTP/IMAP → 开启 SMTP 服务 → 新增授权密码
- 若接口返回 `535 Error: authentication failed`，说明授权码失效，需重新生成并更新 app.env

## 端口与防火墙

- 阿里云轻量服务器云端防火墙默认放行 80 端口；系统内 ufw 未启用
- 若改用其他端口，需同时在阿里云控制台「防火墙」放行
