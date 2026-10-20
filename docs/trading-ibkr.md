# 交易日记与 IBKR

网站读取 `/trading-data.json`。公开 Day 0 固定为 **2026-10-12（上海日期）**；脚本对新报告和既有账本都删除更早的成交、资金流水、净值点和日记。`TRADING_DAY_ZERO` 只能把范围收窄，不能解除该边界。原始 XML、账户号、Token、IBKR 用户名和密码不进入网站或 Git。

当前账户快照来自已连接的 IBKR；持续后台更新需要下述 **只读 Activity Flex** 配置。这个服务只生成／读取报告，没有下单调用。数据文件会公开，提交后也会留在 Git 历史中；默认自动工作流不运行，必须显式开启两项变量。

## 1. 在 IBKR 创建查询

Client Portal → **Performance & Reports → Flex Queries** → 新建 **Activity Flex Query**：

- 只选择自己的一个账户；格式 XML；建议时间格式 `yyyyMMdd`、`HHmmss`、分隔符 `;`，Period 选 Last 30 Calendar Days。
- **Account Information**：Currency / Base Currency。
- **Trades**：只选 **Executions**。包含 Level of Detail、IB Execution ID、Trade ID、Date/Time、Symbol、Underlying Symbol、Description、Asset Class、Multiplier、Currency、FX Rate to Base、Buy/Sell、Quantity、Trade Price、IB Commission、IB Commission Currency、Taxes、FIFO PNL Realized、Open/Close Indicator、Transaction Type、Original Trade ID、Notes/Codes。
- 期权还需 **Expiry、Strike、Put/Call**。股票乘数须为 1；期权使用报告实际乘数，成交金额为数量 × 报价 × 乘数，按完整合约记账。费用正值表示支出，负值表示返佣；已实现盈亏采用 IBKR 字段，缺失保持未知。
- **Cash Transactions**：Transaction ID、Date/Time、Amount、Type、Currency。只将 Deposits/Withdrawals 明细识别为外部入出金；分红等不会被误算成入金。
- **Net Asset Value (NAV) Summary in Base**：Report Date、Cash、Total。
- **Cash Report**：Currency、From Date、To Date、Ending Cash。采用交易日口径，与 NAV Cash 同日核对。
- **Open Positions**：只选 **Summary**；包含 Report Date、Symbol、Underlying Symbol、Description、Asset Class、Currency、FX Rate to Base、Multiplier、Quantity、Cost Basis Money、Position Value、FIFO Unrealized PNL；期权包含 Expiry、Strike、Put/Call。

启用 Flex Web Service，生成 Token，并记录 Activity Query ID。Token 只能放 Secret；有效期 6 小时至 1 年，可限制出口 IP。新 Token 会替换旧 Token。GitHub 托管 runner 出口 IP 不固定；若设置 IP 限制，应使用固定出口的自托管 runner。

## 2. 配置 GitHub Actions

仓库 **Settings → Secrets and variables → Actions**：

| 类别 | 名称 | 值 |
| --- | --- | --- |
| Secret | `IBKR_FLEX_TOKEN` | Flex Token |
| Secret | `IBKR_ACTIVITY_QUERY_ID` | Activity Query ID |
| Variable | `IBKR_SYNC_ENABLED` | `true` |
| Variable | `TRADING_PUBLIC_ENABLED` | `true`，表示确认公开该投影数据 |
| Variable | `TRADING_DAY_ZERO` | `2026-10-12`，或更晚日期 |
| Variable | `TRADING_BASE_CURRENCY` | `USD`，须与账户一致 |
| Variable | `IBKR_REPORT_TIME_ZONE` | 与 Flex 无时区时间一致的 IANA 时区，如 `America/New_York`；请先核对报表 |

不提供默认报表时区，避免成交时间错位。已带 UTC offset 的时间直接转换；无 offset 时间按上述时区处理，夏令时歧义会停止导入。

在 Actions 手动运行 **Sync public trading journal** 检查首轮。之后每个工作日北京时间 **20:30** 读取 Activity 报告，只提交 `public/trading-data.json`。仓库需允许 Actions 写入；受保护分支可能阻止直接提交，可改在允许的同步分支运行。现有网站发布流程需要在这一提交后部署新文件。工作流由 `GITHUB_TOKEN` 创建的提交不会自动触发其他 GitHub Actions 工作流；若现有部署依赖另一个 push 工作流，需将部署接在本工作流后，或手动发布。

## 3. 本机检查／导入

需要 Node.js 22+ 和已安装的项目依赖。把配置放在 Git 忽略的本机 `.env.local`，不要把 Token 写进命令、截图或提交。

```sh
# 本机 XML 检查：不写文件，也无需公开开关或在线凭证
node --env-file=.env.local scripts/sync-ibkr.mjs --input /本机路径/Flex.xml --dry-run

# 确认 TRADING_PUBLIC_ENABLED=true 后才会写入公开投影
node --env-file=.env.local scripts/sync-ibkr.mjs --input /本机路径/Flex.xml

# 在线读取已保存的查询日期范围
node --env-file=.env.local scripts/sync-ibkr.mjs --dry-run

# 日期回补；365 天以上会分段，输出仍严格裁切到 Day 0
node --env-file=.env.local scripts/sync-ibkr.mjs --from 2026-10-12 --to 2026-10-19

# 按日补净值，建议每次只补一月；跳过周末和 IBKR 1003 无报表日期
node --env-file=.env.local scripts/sync-ibkr.mjs --from 2026-10-12 --to 2026-10-19 --daily-snapshots

npm run test:ibkr
```

不把原始 XML 放进仓库。正常日志只显示记录数量；失败时不输出请求 URL、原始 XML、账户号、Token 或 IBKR 原始错误文本。请求固定官方 HTTPS 主机，忽略响应给出的 URL，禁用重定向；每次请求至少间隔 6.5 秒，生成报告最多轮询 5 次，20 秒超时，超限或失败不改账本。XML 超过 20 MiB、DTD／外部实体、取消／更正交易或关键字段缺失会停止，等待人工核对。

## 数据口径

- **这是每日报表同步。** Activity 截止上一营业日，不保证包含今天成交。日内成交可在以后增加 Trade Confirmation 查询；当前连接器快照与 Flex 的读取时间可能不同。
- 多日查询只有相应报告日期的 NAV 快照，不会自动变成每日曲线。每天同步积累历史点，或用日级回补；历史 PA 净值没有现金字段时保留 `cash: null`。
- 成交按 `IB Execution ID` 幂等合并，与 Connector 的 `ibkr-<execution_id>` 一致。重复导入不增加记录；已有每笔备注和每日日记会保留。浏览器本机笔记需要先导出 JSON 才能在其他设备迁移，不会因后台同步自动上传。
- 回补较早报告不会覆盖更新的持仓。持仓按 `holdingsDate` 标明日期，仅展示 Day 0 之后有 BUY 记录的标的；期权未匹配到本期买入的完整合约时，不发布该持仓的未实现盈亏。净值／现金仍是账户总额。当前持仓不是完整历史推算，无法根据缺失开仓记录反推盈亏。
- 仅自动解析基础币种相同的股票与期权。外汇转换、期货及其他品种明确失败，不隐式换算；期权缺失完整合约或乘数也不导入。
- 未取得 Day 0 的成本／资金基线时，累计收益和收益率保持未知；IBKR 单笔已实现盈亏可用于每日复盘。公开数据的完整性默认待核对，不把局部流水当成全账户生命周期。
- IBKR 保存的 Flex 数据通常为当年及前 4 个自然年，单次日期覆盖最多 365 天。此项目公开范围始终从 2026-10-12 开始，任何更早报告都不会被重新发布。

官方参考：[Flex 概览](https://www.interactivebrokers.com/docs/web-api/flex-web-service/introduction)、[Token](https://www.interactivebrokers.com/docs/web-api/flex-web-service/client-portal-configuration/enable-and-create-access-token)、[生成报告](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/generate-the-report)、[读取报告](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service/retrieve-the-report)、[错误码](https://www.interactivebrokers.com/docs/web-api/flex-web-service/error-codes)、[历史和日期范围](https://www.ibkrguides.com/orgportal/performanceandstatements/flex3.htm)、[成交字段](https://www.ibkrguides.com/reportingreference/reportguide/tradesfq.htm)、[持仓字段](https://www.ibkrguides.com/reportingreference/reportguide/open%20positionsfq.htm)、[数据时效](https://ibkrguides.com/clientportal/configure-flex-with-ai.htm)。
