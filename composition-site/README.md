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
- 左侧作文档案 + 右侧阅读页；新建时填写题目、可选小标题/来源、范文。
- 每篇范文自己的单词/短语笔记；服务端验证正文范围、版本和归属，再自行生成所选文本。
- 单击词、拖选合规英文短语、同一位置更新笔记、定位回正文、删除笔记；正文拖选会显示范文夹的暖金色高亮，而不是系统蓝框。
- 所有两词及以上的英文短语统一使用“记录短语”：保存原始选区，并按当前范文语境请求普通中文释义和可选记忆提示；不再识别或改写固定搭配。历史笔记中的学习内容仍会保留并显示原文。
- 悬浮词和打开笔记框时请求语境释义；服务端 24 小时缓存同一篇同一位置的结果，并限制缓存容量。
- 所有未登录或失效会话的受保护接口统一返回 `401`；其他用户既不能读取也不能删改你的范文/笔记。

## 启用 GLM-5.2 语境翻译

后端只从进程/部署环境读取以下变量，绝不把密钥写入前端、仓库或 YAML：

| 变量 | 含义 | 默认值 |
| --- | --- | --- |
| `ZHIPU_API_KEY` | 智谱开放平台服务端密钥 | 无；未配置时返回可恢复的“翻译暂不可用”状态 |
| `ZHIPU_BASE_URL` | 智谱 API 基地址 | `https://open.bigmodel.cn/api/paas/v4` |
| `ZHIPU_MODEL` | 模型名 | `glm-5.2` |

请在本机安全环境或部署平台的 Secret 设置中配置这些变量，再重启服务。若密钥来自 GLM Coding Plan，请按该套餐官方文档设置对应的专用 `ZHIPU_BASE_URL`；不要假定 Coding Plan 密钥可以直接用于公开网站的服务端翻译。

翻译请求使用非流式、确定性 JSON 输出，并关闭思考模式；服务端只发送所选文本和所在句子，不记录密钥或正文到日志。模型服务不可用时，用户仍可手动填写释义和记忆提示。

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
