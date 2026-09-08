# VocabNote Wordbook Implementation Plan

**Goal:** 将已确认单词本完整接入当前站点并验证 MySQL 持久化。

**Architecture:** 词库与作文共享账号，词库独立保存词条、多语境与收藏例句。作文保存事务同步语境，删除解除来源；AI 查询仅在明确操作时触发。

**Tech Stack:** Spring Boot / JPA / MySQL / 原生 HTML CSS JavaScript。

## 执行任务

- [x] 主任务：词库 API 行为测试先验证失败，再实现通过。
- [x] 主任务：词条、多语境、例句、账号隔离、去重及作文同步实现。
- [x] 页面：品牌、分类、两层搜索、录入编辑删除、详情来源和 AI 交互。
- [x] AI：查词与造句接口；本地 HTTP 假上游验证结构输出、超时错误和未配置行为。
- [x] 集成：静态资源打包放行，全量 Maven/Node 检查与浏览器手机验证。
- [x] 本地运行：MySQL 持久化验证完成，保持穿透工作暂停。

## 完成记录（2026-09-07）

上述实现、页面集成与本地启动均已完成。全量后端 86 项测试通过，Node 测试 10 项通过。真实 MySQL 已验证历史摘录导入、并发去重、词形关联、中文搜索、例句收藏和重启后数据保留。

浏览器验证了个人词库筛选、跨分类精确查询、录入编辑删除、作文来源往返、搭配收录后即时关联、手机列表与详情。AI 页面流程使用独立浏览器模拟上游验证，真实未配置服务返回 503 并保留手动入口；实际模型调用仍待本机密钥和模型配置。测试账号及其数据已清理。

## API 合同明细

词条保存 `{term,translationZh,note}`，返回详情 `{id,term,kind,translationZh,note,senses:[{id,translationZh,note,sentence,compositionId,compositionTitle,annotationId}],related:[{id,term,kind,translationZh}],examples:[{id,english,translationZh,usage}]}`。

列表 GET `/api/wordbook?kind=word|phrase&q=...&page=0&size=60`；精确查询可用 `exact=...` 且忽略分类。语境搜索包含各语境释义。例句 POST `/api/wordbook/{id}/examples` body `{english,translationZh,usage}`，DELETE `/api/wordbook/{id}/examples/{exampleId}`。

AI POST `/api/wordbook/lookup` body `{query}`，返回 `{term,kind,translationZh,memoryHint,collocations:[{term,translationZh}]}`。POST `/api/wordbook/sentence` body `{term,translationZh}` 返回 `{english,translationZh,usage}`。失败 503/429，前端保留手动录入。
