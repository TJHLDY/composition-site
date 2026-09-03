# 范文夹

这是一个与现有 `vocabulary/`、`vocabulary-frontend/` 完全分开的作文学习站：账号、范文、笔记、数据库和部署都独立。

## 本地启动

在 `D:\ieda-java\vocabNote` 执行：

```powershell
mvn -f .\composition-site\server\pom.xml spring-boot:run
```

然后从同源地址打开 [http://localhost:8088/](http://localhost:8088/)。不要继续用 `4173` 的静态预览地址做真实数据操作；真实登录、保存、笔记和翻译请求都由 `8088` 这个独立服务处理。

本地默认使用 `composition-site/server/data/` 下的 H2 数据库。该目录、构建产物和密钥文件都已被 `composition-site/.gitignore` 排除。

## 已实现

- 独立注册、登录、登出和 30 天不透明会话；默认只把会话令牌放在 `sessionStorage`。登录可勾选「七天内自动登录」：令牌与邮箱在本设备保留 7 天用于自动进入，密码永不写入浏览器存储；退出登录或过期后自动清除。
- 注册需要邮箱验证码：填写邮箱后点「获取验证码」，6 位验证码 5 分钟内有效，一分钟内只能获取一次，连错五次作废。忘记密码同样通过邮箱验证码重置；重置成功后该账号所有旧会话立即作废，需要用新密码重新登录。
- 左侧作文档案 + 右侧阅读页；新建时填写题目、可选小标题/来源、范文。
- 每篇范文自己的单词/短语笔记；服务端验证正文范围、版本和归属，再自行生成所选文本。
- 单击词、拖选合规英文短语、同一位置更新笔记、定位回正文、删除笔记；正文拖选会显示范文夹的暖金色高亮，而不是系统蓝框。
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

## 启用语境翻译（OpenAI 兼容中转）

后端通过 OpenAI 兼容的 `chat/completions` 接口调用大模型（默认对接 taotoken 中转站，也可换成任意兼容提供商）。密钥与模型只从进程/部署环境读取，绝不写入前端、仓库或 YAML：

| 变量 | 含义 | 默认值 |
| --- | --- | --- |
| `TRANSLATION_API_KEY` | 中转站/提供商的 API 密钥（Bearer Token） | 无；未配置时返回可恢复的“翻译暂不可用”状态 |
| `TRANSLATION_BASE_URL` | OpenAI 兼容接口基地址（末尾到 `/v1`，代码会拼接 `/chat/completions`） | `https://taotoken.net/api/v1` |
| `TRANSLATION_MODEL` | 模型 ID（在中转站模型广场选择） | 无；必须配置 |
| `TRANSLATION_TEMPERATURE` | 采样温度（0 为确定性输出） | `0` |
| `TRANSLATION_STRUCTURED_OUTPUT` | 是否发送 `response_format: json_object` | `true` |

请在本机安全环境或部署平台的 Secret 设置中配置 `TRANSLATION_API_KEY` 与 `TRANSLATION_MODEL`，再重启服务。若某个模型不支持 `response_format`，可把 `TRANSLATION_STRUCTURED_OUTPUT` 设为 `false`。

翻译请求使用非流式、确定性 JSON 输出；服务端只发送所选文本和所在句子，不记录密钥或正文到日志。模型服务不可用时，用户仍可手动填写释义和记忆提示。

## MySQL 部署配置

生产库启用 `mysql` Profile，并由部署环境提供：

| 变量 | 含义 |
| --- | --- |
| `COMPOSITION_DB_URL` | MySQL JDBC URL |
| `COMPOSITION_DB_USERNAME` | 数据库账号 |
| `COMPOSITION_DB_PASSWORD` | 数据库密码 |

启动参数示例：`--spring.profiles.active=mysql`。当前首版使用 JPA 的 `ddl-auto: update` 创建/升级独立表；公开发布前应再配反向代理 HTTPS、受管 MySQL 备份和正式数据库迁移策略。

## 验证

```powershell
node .\composition-site\tests\api-client.test.js
node .\composition-site\tests\essay-utils.test.js
node .\composition-site\tests\ui-contract.test.js
mvn -f .\composition-site\server\pom.xml test
```
