# 2026-10-14 Ponder 对话恢复记录

## 已核实的现象

- 原对话：`01a138bc-7365-7ea2-81bf-3be934b8bbdc`，标题“请你把https://github.com/MCSCPCB/Ponder拉取下来”。
- 第一次续接：`01a13900-25a9-7c51-ae15-a44f55f8d7b8`，标题“查找并继续最近的 Ponder 对话”。
- 两个会话的原始记录均没有成功的 `compacted` 条目。最后一次采样记录的上下文分别约为 205,870 和 179,018 token（含当次输出），原对话后续返回 `response protection is unavailable`，续接窗口最后一轮被中断。
- 因此能确认大上下文阶段发生了服务端错误和中断，不能仅凭上述记录断言后台压缩接口损坏。
- 对照 `01a0992b-78fe-7313-a431-d6c3b84ed6b7`（“规划sable物理引擎迁移”）的成功压缩：保留约 7,735 字符的文字摘要及必要消息，后续一次采样总上下文约 31,119 token。

## 已实施的调整

项目级 `.codex/config.toml` 将自动压缩阈值设为 100,000 token，提前腾出上下文余量。没有更改全局模型、推理档位或其他项目的配置。
`AGENTS.md` 指向精简续接摘要，要求按需要读取原始历史；`.codex/SESSION_CONTEXT.md` 保存用户已确认的约束、排除范围、未完成事项和核验边界。
旧会话原始记录保持完整，本次没有覆盖或删除会话、改写 SQLite 会话数据。

配置依据：已读取 OpenAI Codex 官方配置模式定义中的 `model_auto_compact_token_limit`，其含义为触发历史自动压缩的 token 使用阈值。本机 app-server 的 `config/read` 已确认 Ponder 的有效值为 `100000`。
官方配置来源：`https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json`。

## 压缩验证

本机 Codex `0.162.0-alpha.17.2`，使用当前 `gpt-6-astra` 与当前服务商。
隔离的临时会话只进行文字压缩诊断，无业务代码操作：

1. 输入待保留事实 `PONDER_REGION=player_current_dimension`。
2. 调用本机 `thread/compact/start`，压缩操作完成。
3. 在压缩后继续询问事实，准确返回 `player_current_dimension`。

原始结果：`C:\Users\27906\.codex\tmp\ponder-compaction-diagnostics\probe-result.json`。

自动触发复测：仅在临时诊断会话中把阈值设为 24,000 token，输入约 30,000 token 的历史，随后观察到 `contextCompaction` 事件，后续答复准确恢复同一事实，测试通过。没有把这个诊断阈值写入项目或全局配置。结果：`C:\Users\27906\.codex\tmp\ponder-compaction-diagnostics\auto-probe-result.json`。

另一次较大输入的自动诊断也完成了压缩，但后续服务端响应流断连，超过诊断时间上限；该失败结果保留在 `auto-probe-stream-timeout.json`。因此不能声称已修复服务商所有流连接故障。

上述验证证明手动及自动压缩后可续接；没有复现旧会话完全相同的大规模服务端故障，也无法保证服务商今后不会发生错误。新阈值旨在减少到达出错规模的机会，续接摘要则提供可恢复的讨论状态。

## 物品图标调查

用户选择条件：原版物品数值标识固定才采用 `item_id_aux`；原版标识也会变化时，继续脚本指定贴图路径。

本次读取的文档：

- Bedrock Wiki JSON UI 文档：`https://wiki.bedrock.dev/json-ui/json-ui-documentation`。
- Bedrock Wiki 数值物品 ID 文档：`https://wiki.bedrock.dev/items/numerical-item-ids`。
- 对应作者维护的源码：`https://github.com/Bedrock-OSS/bedrock-wiki/blob/wiki/docs/items/numerical-item-ids.md`。

该数值 ID 文档标注当前数据对应 26.50。它区分不受自定义物品影响的原版 ID 范围，以及随资源包栈中的自定义物品数量偏移的原版范围；后者包含苹果、发光浆果及另一些原版物品。因此不能把所有 `minecraft:` 物品统一视为不会受 addon 影响的固定编号。

JSON UI 文档提供零附加值示例的 `item_id_aux = 数值 ID × 65536`。这个乘法不能解决运行时编号偏移，也不等于能从命名空间 ID 动态读取当前物品的正确编号。

决定：保留场景和按钮的 `iconPath`，不新增通用静态数值映射。已更新待办中的物品图标目标，避免仍然要求自动生成任意物品的模型缩略图。

适用边界：以上结论来自实际读取的社区开发文档，非 Mojang 对所有历史和未来版本的保证；本轮未启动 Minecraft 实测。但已存在“部分原版编号会变”的明确证据，满足用户要求启用贴图路径回退的条件。
