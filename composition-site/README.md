# VocabNote · 单词与写译笔记

VocabNote 将个人单词本与作文阅读笔记放在同一个学习空间，使用独立账号与 MySQL 数据库。

## 本地启动（必须 MySQL 持久化）

当前电脑已配置本地 MySQL，直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\composition-site\scripts\start-local.ps1
# 修改代码后重新打包并启动
powershell -ExecutionPolicy Bypass -File .\composition-site\scripts\start-local.ps1 -Build
```

脚本使用 `server/data/vocabnote-local.properties` 中的本机设置（已排除 Git），只监听 `127.0.0.1:8088`。日志位于 `server/server-run.log` 和 `server/server-error.log`。本地脚本使用此仓库的 `mysql-runtime/my.ini`；其他电脑需自行配置数据库。

本项目默认使用 **MySQL**（而不再使用 H2）。启动前先配置数据库环境变量：

```powershell
$env:COMPOSITION_DB_URL = 'jdbc:mysql://127.0.0.1:3306/composition_site?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true'
$env:COMPOSITION_DB_USERNAME = '你的MySQL用户名'
$env:COMPOSITION_DB_PASSWORD = '你的MySQL密码'

mvn -f .\composition-site\server\pom.xml spring-boot:run
```

然后从同源地址打开 [http://localhost:8088/](http://localhost:8088/)（不要再用 `4173` 的静态预览地址做真实登录/注册/保存）。

## 内网穿透（手机/外网临时调试）

如果你希望外网手机、同事直接访问这台电脑上的站点（用于联调与验收），最方便的是用隧道工具把 `8088` 映射出来。服务默认端口就是 `8088`，先确认本地服务已启动。

### 1）Ngrok（最常用）

1. 注册并在 ngrok 控制台拿 `authtoken`。
2. 下载并安装 ngrok（或用你已装好的 ngrok）。
3. 在本机启动服务：

```powershell
cd D:\ieda-java\vocabNote
$env:COMPOSITION_DB_URL = 'jdbc:mysql://127.0.0.1:3306/composition_site?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true'
$env:COMPOSITION_DB_USERNAME = '你的MySQL用户名'
$env:COMPOSITION_DB_PASSWORD = '你的MySQL密码'
mvn -f .\composition-site\server\pom.xml spring-boot:run
```

4. 打开另一个终端拉起隧道：

```powershell
ngrok config add-authtoken <你的 ngrok token>
ngrok http 8088
```

ngrok 会给你一个公网地址（例如 `https://xxxx.ngrok-free.app`），把这个地址发给手机即可访问。

### 2）Cloudflare Tunnel（可长期稳定）

前提是你有 Cloudflare 账号并添加了域名：

```powershell
cloudflared tunnel create composition-site
cloudflared tunnel route dns composition-site tunnel-name.yourdomain.com
cloudflared tunnel run composition-site
```

你也可以用项目里的脚本一键启动（会先跑后端再启动 ngrok）：

```powershell
cd D:\ieda-java\vocabNote\composition-site\scripts
# 脚本启动前先设置 COMPOSITION_DB_* 环境变量
.\start-with-ngrok.ps1 -NgrokAuthtoken <你的 ngrok token>
```

或者直接双击运行（首次会让你输入 token）：

```powershell
cd D:\ieda-java\vocabNote\composition-site\scripts
.\start-with-ngrok.bat
```

脚本会按顺序输出：服务启动状态、局域网地址、公网地址（若抓到的话），最后提示“Press Ctrl + C”。

### 3）本机局域网共享（不用公网）

用于同一局域网设备访问（例如同一 Wi-Fi）：

```powershell
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.AddressState -eq 'Preferred' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
Write-Output "http://$ip:8088/"
```

## 持久化说明

数据库默认走 `COMPOSITION_DB_*` 连接的 MySQL，本地脚本可由属性文件提供连接。账号、范文、词条、阅读语境和收藏例句均持久化；H2 仅用于自动化测试。

首次打开词库会导入已有作文摘录。之后保存摘录自动归档；同一表达合并为一个词条，各作文释义和原句单独保留。删除作文或摘录仅解除来源链接。删除词库词条会删除其语境与例句，但保留来源作文和关联词条，旧摘录也不会在刷新后重新生成已删除词条。

## 给别人用（快速发布）

本项目已经支持直接用 Docker + Render 一键部署。推荐流程如下：

1. 若选择这套发布流程，将仓库连接到部署平台。
2. 访问 Render，创建一个新的 **Web Service**，选择该仓库。
3. Render 会识别 `composition-site/render.yaml`。
4. 在 Deploy 设置里填环境变量：
   - `TRANSLATION_API_KEY`（你的模型密钥）
   - `TRANSLATION_MODEL`（你的模型名，如 `glm-4-plus`）
   - `COMPOSITION_MAIL_USERNAME` / `COMPOSITION_MAIL_PASSWORD`（可选，验证码邮件用）
5. 部署完成后会拿到一个公开 URL，直接把链接发给别人即可。

### Railway 一键部署（可选）

本目录也可直接被 Railway 识别：

1. 在 Railway 创建 Web Service，连接本仓库。
2. 选择 `main` 分支并保持默认部署命令（会自动读取 `composition-site/railway.toml`）。
3. 在环境变量里配置：
   - `TRANSLATION_API_KEY`
   - `TRANSLATION_MODEL`
   - `COMPOSITION_MAIL_USERNAME` / `COMPOSITION_MAIL_PASSWORD`（可选）
4. 点击 Deploy，拿到公开访问 URL 即可发给别人。

说明：
- 本站点前端和后端是同一个 Spring Boot 服务，Render 直接暴露一个公开接口，不需要额外配置。
- 默认数据库就是 MySQL（见下方 MySQL 部分），本地和部署环境都使用同一套持久化配置。

## 已实现

- 单词本与写译笔记共享账户，延续纸张、墨绿与暖金色界面。
- 单词 / 短语按 A–Z 浏览；输入仅筛选个人词库，回车先精确查找收藏，再查询 AI 新表达，查询结果需主动收录。
- 手动收录与释义 / 备注编辑、多语境来源跳转、关联词条、独立删除确认；AI 搭配可选中收录，短语例句可生成、换句、复制与收藏。
- 手机支持词库与详情切换；离开页面或退出账户后，未完成请求不会更新词库界面。

AI 客户端已接入，查词、搭配和造句需要服务端已有的模型服务配置。本地未配置时会显示重试提示，仍可手动录入和编辑。

- 独立注册、登录、登出和 30 天不透明会话；默认只把会话令牌放在 `sessionStorage`。登录可勾选「七天内自动登录」：令牌与邮箱在本设备保留 7 天用于自动进入，密码永不写入浏览器存储；退出登录或过期后自动清除。
- 注册需要邮箱验证码：填写邮箱后点「获取验证码」，6 位验证码 5 分钟内有效，一分钟内只能获取一次，连错五次作废。忘记密码同样通过邮箱验证码重置；重置成功后该账号所有旧会话立即作废，需要用新密码重新登录。
- 左侧作文档案 + 右侧阅读页；新建时填写题目、可选小标题/来源、范文。
- 每篇范文自己的单词/短语笔记；服务端验证正文范围、版本和归属，再自行生成所选文本。
- 单击词、拖选合规英文短语、同一位置更新笔记、定位回正文、删除笔记；正文拖选显示 VocabNote 的暖金色高亮。
- 所有两词及以上的英文短语统一使用“记录短语”：保存原始选区，并按当前范文语境请求普通中文释义和可选记忆提示；不再识别或改写固定搭配。历史笔记中的学习内容仍会保留并显示原文。
- 悬浮词和打开笔记框时请求语境释义；服务端 24 小时缓存同一篇同一位置的结果，并限制缓存容量。
- 所有未登录或失效会话的受保护接口统一返回 `401`；其他用户既不能读取也不能删改你的范文/笔记。

## 启用邮箱验证码

验证码通过 SMTP 发送，默认复用主项目 `vocabulary` 的 163 邮箱配置；后端只从环境变量读取，密钥不进仓库：

| 变量 | 含义 | 默认值 |
| --- | --- | --- |
| `COMPOSITION_MAIL_PASSWORD` | 发件邮箱的 SMTP 授权码（不是邮箱登录密码） | 无；未配置时发码接口返回可恢复的 503「邮件服务未配置」，站点其余功能照常 |
| `COMPOSITION_MAIL_HOST` | SMTP 服务器 | `smtp.163.com` |
| `COMPOSITION_MAIL_PORT` | SMTP 端口 | `465` |
| `COMPOSITION_MAIL_USERNAME` | 发件邮箱 | `VocabNote@163.com` |

本地也可以把授权码写进 `server/mail-local.txt`（已被 `.gitignore` 排除），启动前用脚本读入环境变量，避免出现在命令历史里。

## 个人 AI 设置

登录后点击右上角「AI 设置」，选择 DeepSeek 官方或 Taotoken，填写该服务商的 API Key，测试连接后保存。两家密钥不能混用；测试连接也会产生一次小额请求。

- DeepSeek 官方注册：https://platform.deepseek.com/
- Taotoken 注册（邀请链接）：https://taotoken.net/?u=inv_j24g5dtpokbj4s2n&utm_source=tt_invite
- 固定使用 deepseek-v4-flash，关闭思考模式。每个账号独立配置；未配置返回 428，绝不回退使用站点的全局 Key。
- GET /api/ai-settings 仅返回配置状态与掩码；PUT 保存或替换，DELETE 删除；POST /api/ai-settings/test 测试但不保存。

API Key 按用户明文持久化在 MySQL 的 user_ai_settings.api_key；owner_id 对应 app_users.id，provider 填 deepseek 或 taotoken。管理员可以直接修改 api_key，下一次 AI 请求就会读取新值。网页不回显完整密钥，费用由对应服务商账户承担。升级时自动将旧 encrypted_key 解密迁移到 api_key 并清空旧字段；迁移前须保留原加密主密钥或文件，迁移完成后新配置与正常使用不再依赖它。数据库及备份中包含明文密钥。

旧 TRANSLATION_API_KEY 和本地全局 AI 配置不再用于用户请求，已有用户也需要配置自己的 Key。

单词本通过 POST /api/wordbook/define 优先查询有道词典（HTTPS），基础查词不要求个人 AI Key。词典不可用或无结果时使用个人 AI 配置；搭配调用 /api/wordbook/lookup，造句调用 /api/wordbook/sentence，语境解释同样使用个人配置。

确认收录后，完整词典资料保存在 wordbook_entries.dictionary_json 中；重新打开直接读取数据库，编辑核心释义与备注不会覆盖快照。输入搜索文字只筛选个人词库，不调用外部接口。

翻译请求使用非流式、确定性 JSON 输出；服务端只发送所选文本和所在句子，不记录密钥或正文到日志。模型服务不可用时，用户仍可手动填写释义和记忆提示。

## MySQL 配置（本地和生产统一）

应用启动时默认按 MySQL 配置，不再区分 profile：

| 变量 | 含义 |
| --- | --- |
| `COMPOSITION_DB_URL` | MySQL JDBC URL |
| `COMPOSITION_DB_USERNAME` | 数据库账号 |
| `COMPOSITION_DB_PASSWORD` | 数据库密码 |

示例值：`jdbc:mysql://127.0.0.1:3306/composition_site?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true`

应用启动时会用 JPA 的 `ddl-auto: update` 创建/升级表。发布前建议配反向代理 HTTPS、受管 MySQL 备份与迁移策略。

## 验证

```powershell
node .\composition-site\tests\api-client.test.js
node .\composition-site\tests\essay-utils.test.js
node .\composition-site\tests\ui-contract.test.js
node --test .\composition-site\tests\wordbook.test.js
mvn -f .\composition-site\server\pom.xml test
```
