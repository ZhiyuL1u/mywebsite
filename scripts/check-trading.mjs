import assert from 'node:assert/strict'
import { createEmptyJournal, getPositions, importJournalJson, importTradesCsv, mergePublicWithDraft, summarize, tradeDateKey, tradeGrossAmount, tradesToCsv, validateJournal } from '../src/trading/model.ts'
import { createDemoJournal } from '../src/trading/demo.ts'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`)
const trade = (id, side, quantity, price, fee = 0, extra = {}) => ({
  id, executedAt: `2026-10-${id.padStart(2, '0')}T14:30:00Z`, symbol: 'TEST', side,
  quantity, price, fee, currency: 'USD', ...extra,
})
const journal = (trades = [], extra = {}) => ({ ...createEmptyJournal(), trades, ...extra })

// Opening fees belong in cost basis; closing fees reduce realized gains.
const weighted = journal([trade('1', 'BUY', 10, 100, 2), trade('2', 'BUY', 10, 120, 2), trade('3', 'SELL', 5, 130, 1)])
near(getPositions(weighted)[0].quantity, 15)
near(getPositions(weighted)[0].averageCost, 110.2)
near(summarize(weighted).realizedPnl, 98)
near(summarize(weighted).fees, 5)
assert.equal(summarize(weighted).nav, null)
assert.equal(summarize(weighted).cash, null)
assert.equal(summarize(weighted).totalPnl, null)
const rebate = validateJournal(journal([trade('1', 'BUY', 10, 100, -1), trade('2', 'SELL', 5, 110, -0.5)]))
near(getPositions(rebate)[0].averageCost, 99.9)
near(summarize(rebate).realizedPnl, 51)
near(summarize(rebate).fees, -1.5)

// Selling through zero opens a short position; buying through zero opens a long.
const reversal = journal([trade('1', 'BUY', 10, 100, 1), trade('2', 'SELL', 15, 120, 3), trade('3', 'BUY', 8, 110, 1.6)])
near(summarize(reversal).realizedPnl, 245)
near(getPositions(reversal)[0].quantity, 3)
near(getPositions(reversal)[0].averageCost, 110.2)
const fraction = journal([trade('1', 'BUY', 0.1, 100), trade('2', 'BUY', 0.2, 100), trade('3', 'SELL', 0.3, 100)])
assert.equal(getPositions(fraction).length, 0)
near(summarize(fraction).realizedPnl, 0)
assert.equal(getPositions(journal([trade('1', 'BUY', 1e-12, 100)])).length, 1)

// Snapshot values are authoritative, and cashflows after a snapshot do not
// rewrite its historical profit. NAV cannot be inferred from execution prices.
const funded = journal([], {
  dayZero: '2026-10-01',
  cashflows: [
    { id: 'fund', date: '2026-10-01', type: 'DEPOSIT', amount: 1000, currency: 'USD' },
    { id: 'out', date: '2026-10-02', type: 'WITHDRAWAL', amount: 200, currency: 'USD' },
    { id: 'later', date: '2026-10-04', type: 'DEPOSIT', amount: 500, currency: 'USD' },
  ],
  snapshots: [{ id: 'nav', date: '2026-10-03', netAssetValue: 900, cash: 300, currency: 'USD' }],
})
assert.deepEqual({ ...summarize(funded) }, {
  nav: 900, cash: 300, netContributions: 800, totalPnl: 100, totalReturn: 0.125,
  realizedPnl: 0, fees: 0, tradeCount: 0, valuationDate: '2026-10-03', hasFundingBaseline: true,
  realizedPnlIsComplete: true,
})
assert.equal(summarize({ ...funded, dayZero: null }).totalPnl, null)
assert.equal(summarize({ ...funded, cashflows: funded.cashflows.slice(1) }).totalPnl, null)

// Diary entries are independent of executions, including no-trade days, and
// preserve multiline text without inventing a profit value for the day.
const diary = validateJournal({ ...funded, dailyNotes: [
  { date: '2026-10-01', text: '开仓前：观察量能。\n收盘后：遵守计划。', updatedAt: '2026-10-01T22:30:00+08:00' },
  { date: '2026-10-02', text: '今天没有交易，继续等待。', updatedAt: '2026-10-02T22:30:00+08:00' },
] })
assert.equal(diary.dailyNotes[0].updatedAt, '2026-10-01T14:30:00.000Z')
assert.deepEqual(importJournalJson(JSON.stringify(diary)), diary)
assert.equal(summarize(diary).totalPnl, summarize(funded).totalPnl)
assert.throws(() => validateJournal({ ...diary, dailyNotes: [diary.dailyNotes[0], diary.dailyNotes[0]] }), /重复日期/)
assert.throws(() => validateJournal({ ...diary, dailyNotes: [{ ...diary.dailyNotes[0], text: '字'.repeat(5001) }] }), /5000/)
assert.throws(() => validateJournal({ ...diary, dailyNotes: [{ ...diary.dailyNotes[0], text: 42 }] }), /正文/)
assert.throws(() => validateJournal({ ...diary, dailyNotes: [{ ...diary.dailyNotes[0], date: '2026-09-30' }] }), /早于 Day 0/)
assert.throws(() => validateJournal({ ...diary, dailyNotes: [{ ...diary.dailyNotes[0], updatedAt: '2026-10-01T22:30:00' }] }), /时区/)
assert.throws(() => validateJournal({ ...diary, dailyNotes: [{ ...diary.dailyNotes[0], date: '2026-02-30' }] }), /日期/)
const navOnly = validateJournal({ ...funded, snapshots: [
  ...funded.snapshots,
  { id: 'nav-only', date: '2026-10-05', netAssetValue: 1400, cash: null, currency: 'USD' },
] })
assert.equal(summarize(navOnly).nav, 1400)
assert.equal(summarize(navOnly).cash, null)

// Underlying-only option records cannot identify different contracts. They
// neither create stock holdings nor produce invented stock cost-basis gains.
const mixedAssets = validateJournal(journal([
  trade('1', 'BUY', 10, 100, 1, { symbol: 'AAPL', assetClass: 'STK' }),
  trade('2', 'SELL', 1, 2, 1, { symbol: 'AAPL', assetClass: 'OPT', grossAmount: 200, instrumentLabel: 'AAPL · contract unavailable' }),
  trade('3', 'BUY', 1, 1, 1, { symbol: 'AAPL', assetClass: 'OPT', grossAmount: 100, instrumentLabel: 'AAPL · contract unavailable' }),
  trade('4', 'BUY', 2, 100, 1, { symbol: 'ES', assetClass: 'FUT', grossAmount: 10000 }),
]))
assert.equal(getPositions(mixedAssets).length, 1)
assert.equal(getPositions(mixedAssets)[0].quantity, 10)
assert.equal(getPositions(mixedAssets)[0].symbol, 'AAPL')
assert.equal(summarize(mixedAssets).realizedPnl, null)
assert.equal(summarize(mixedAssets).realizedPnlIsComplete, false)
assert.equal(tradeGrossAmount(mixedAssets.trades[1]), 200)
assert.equal(mixedAssets.trades.reduce((sum, entry) => sum + tradeGrossAmount(entry), 0), 11300)
assert.equal(tradeGrossAmount(trade('1', 'BUY', 2, 100)), 200)
assert.equal(tradeGrossAmount(trade('1', 'BUY', 1, 2, 0, { assetClass: 'OPT' })), null)
assert.equal(tradeGrossAmount(trade('1', 'BUY', 1, 0, 0, { assetClass: 'OPT', grossAmount: 0 })), 0)
near(getPositions(journal([trade('1', 'BUY', 2, 100, 1, { grossAmount: 201 })]))[0].averageCost, 101)
const executionPnl = validateJournal(journal([
  trade('1', 'BUY', 1, 1, 0.25, { assetClass: 'OPT', realizedPnl: 0, positionEffect: 'OPEN' }),
  trade('2', 'SELL', 1, 2, 0.25, { assetClass: 'OPT', realizedPnl: 99.5, positionEffect: 'CLOSE' }),
  trade('3', 'SELL', 1, 1, 0.25, { assetClass: 'OPT', realizedPnl: -12.5, positionEffect: 'UNKNOWN' }),
  trade('4', 'BUY', 1, 1, 0.25, { assetClass: 'OPT' }),
]))
assert.equal(executionPnl.trades[0].realizedPnl, 0)
assert.equal(executionPnl.trades[3].realizedPnl, undefined)
assert.equal(executionPnl.trades[3].positionEffect, undefined)
assert.equal(summarize(executionPnl).realizedPnl, null)
assert.deepEqual(importJournalJson(JSON.stringify(executionPnl)), executionPnl)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 1, 0, { realizedPnl: null })])), /已实现盈亏/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 1, 0, { realizedPnl: Infinity })])), /已实现盈亏/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 1, 0, { positionEffect: 'BUY' })])), /开平仓/)

// Explicit holdings are broker state, including multiple contracts with the
// same underlying and an explicitly empty account. Never merge them by symbol.
const authoritative = validateJournal({ ...mixedAssets, source: 'ibkr-connector',
  holdingsDate: '2026-10-05',
  coverage: { start: '2026-10-01', end: '2026-10-05', complete: false, note: '连接器仅返回近期交易，合约信息不完整。' },
  holdings: [
    { symbol: 'AAPL', instrumentLabel: 'AAPL 2026-11-20 200 C', assetClass: 'OPT', quantity: 1, averageCost: 2, currency: 'USD', marketValue: 210, unrealizedPnl: 10 },
    { symbol: 'AAPL', instrumentLabel: 'AAPL 2026-12-18 210 C', assetClass: 'OPT', quantity: -1, averageCost: 3, currency: 'USD', marketValue: -250, unrealizedPnl: 50 },
  ],
})
assert.deepEqual(getPositions(authoritative), authoritative.holdings)
assert.equal(getPositions(authoritative).length, 2)
assert.deepEqual(getPositions({ ...authoritative, holdings: [] }), [])
assert.deepEqual(importJournalJson(JSON.stringify(authoritative)), authoritative)
const incompleteFunded = { ...funded, source: 'ibkr-connector', coverage: authoritative.coverage }
assert.equal(summarize(incompleteFunded).totalPnl, null)
assert.equal(summarize(incompleteFunded).realizedPnl, null)
assert.equal(summarize({ ...funded, source: 'ibkr-connector' }).hasFundingBaseline, false)
assert.equal(summarize({ ...incompleteFunded, coverage: { ...authoritative.coverage, complete: true } }).totalPnl, 100)
assert.throws(() => validateJournal({ ...authoritative, coverage: { ...authoritative.coverage, start: '2026-10-06' } }), /不能晚于/)
assert.throws(() => validateJournal({ ...authoritative, coverage: { ...authoritative.coverage, complete: 'false' } }), /布尔值/)
assert.throws(() => validateJournal({ ...authoritative, holdings: [{ ...authoritative.holdings[0], marketValue: Infinity }] }), /市值/)
assert.throws(() => validateJournal({ ...authoritative, holdings: [{ ...authoritative.holdings[0], currency: 'EUR' }] }), /不自动换汇/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { grossAmount: -1 })])), /成交总额/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { assetClass: ['STK'] })])), /资产类别/)

// Imports are normalized and validated, with no silent currency conversion.
assert.equal(validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { currency: 'usd' })])).trades[0].currency, 'USD')
for (const invalid of [NaN, Infinity, '10', null, -1]) {
  assert.throws(() => validateJournal(journal([trade('1', 'BUY', invalid, 10)])))
}
assert.throws(() => validateJournal(journal([trade('1', 'HOLD', 1, 10)])), /方向/)
assert.equal(validateJournal(journal([trade('1', 'BUY', 1, 10, -1)])).trades[0].fee, -1)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10, NaN)])), /手续费/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { executedAt: '2026-02-30T00:00:00Z' })])), /日期/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { executedAt: '2026-10-01T09:30:00' })])), /时区/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { currency: 'EUR' })])), /不自动换汇/)
assert.throws(() => summarize(journal([trade('1', 'BUY', 1, 10, 0, { currency: 'EUR' })])), /不自动换汇/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10), trade('1', 'SELL', 1, 10)])), /重复 ID/)
assert.throws(() => validateJournal(journal([trade('1', 'BUY', 1, 10)], { dayZero: '2026-10-02' })), /早于 Day 0/)
assert.equal(tradeDateKey('2026-10-01T17:00:00Z'), '2026-10-02')
assert.doesNotThrow(() => validateJournal(journal([trade('1', 'BUY', 1, 10, 0, { executedAt: '2026-10-01T17:00:00Z' })], { dayZero: '2026-10-02' })))
assert.throws(() => importJournalJson('{bad'), /JSON 文件格式/)
assert.deepEqual(importJournalJson(JSON.stringify(funded)), validateJournal(funded))

// CSV roundtrips commas, escaped quotes, unicode and multiline notes.
const roundtrip = validateJournal(journal([trade('1', 'BUY', 1.25, 123.45, 0.35, { notes: ' 复盘, "耐心"\n继续观察 ' })])).trades
assert.deepEqual(importTradesCsv(tradesToCsv(roundtrip)), roundtrip)
assert.deepEqual(importTradesCsv(tradesToCsv(mixedAssets.trades)), mixedAssets.trades)
assert.deepEqual(importTradesCsv(tradesToCsv(executionPnl.trades)), executionPnl.trades)
const brokerCsv = 'TradeID,DateTime,Symbol,Buy/Sell,Quantity,TradePrice,IBCommission,CurrencyPrimary\n100,2026-10-01T09:30:00-04:00,AAPL,SELL,-2,100,-1,USD\n'
const broker = importTradesCsv(brokerCsv)[0]
assert.equal(broker.quantity, 2)
assert.equal(broker.fee, 1)
assert.equal(broker.executedAt, '2026-10-01T13:30:00.000Z')
assert.equal(importTradesCsv(brokerCsv.replace('100,-1,USD', '100,0.25,USD'))[0].fee, -0.25)
assert.equal(importTradesCsv(brokerCsv.replace('IBCommission', 'Commission'))[0].fee, 1)
const optionCsv = 'TradeID,DateTime,Symbol,Buy/Sell,Quantity,TradePrice,IBCommission,CurrencyPrimary,AssetCategory,Proceeds,ContractDescription\n101,2026-10-01T09:30:00-04:00,AAPL,BUY,2,1.5,-1,USD,OPT,-300,AAPL 2026-11-20 200 C\n'
assert.equal(importTradesCsv(optionCsv)[0].grossAmount, 300)
assert.equal(importTradesCsv(optionCsv)[0].assetClass, 'OPT')
assert.equal(getPositions(journal(importTradesCsv(optionCsv))).length, 0)
const brokerPnlCsv = optionCsv.replace('ContractDescription\n', 'ContractDescription,FifoPnlRealized,OpenCloseIndicator\n')
  .replace('AAPL 2026-11-20 200 C\n', 'AAPL 2026-11-20 200 C,0,O\n')
assert.equal(importTradesCsv(brokerPnlCsv)[0].realizedPnl, 0)
assert.equal(importTradesCsv(brokerPnlCsv)[0].positionEffect, 'OPEN')
const anonymousCsv = 'executedAt,symbol,side,quantity,price,currency\n2026-10-01T00:00:00Z,AAPL,BUY,1,100,USD\n'
assert.equal(importTradesCsv(anonymousCsv)[0].id, importTradesCsv(anonymousCsv)[0].id)
assert.throws(() => importTradesCsv(anonymousCsv + '2026-10-01T00:00:00Z,AAPL,BUY,1,100,USD\n'), /重复 ID/)
assert.throws(() => importTradesCsv('symbol,quantity\nAAPL,1\n'), /缺少/)
assert.throws(() => importTradesCsv('executedAt,symbol,side,quantity,price,currency\n"unclosed'), /未闭合/)
assert.throws(() => importTradesCsv(anonymousCsv.replace('BUY,1,', 'BUY,abc,')), /数量/)
assert.throws(() => importTradesCsv(anonymousCsv.replace(',100,USD', ',100,USD,extra')), /列数/)
assert.equal(importTradesCsv('executedAt,symbol,side,quantity,price,fee,currency\n2026-10-01T00:00:00Z,AAPL,BUY,1,100,-1,USD\n')[0].fee, -1)
assert.equal(importTradesCsv('executedAt,symbol,side,quantity,price,fee,currency\n2026-10-01T00:00:00Z,AAPL,BUY,1,100,1,USD\n')[0].fee, 1)
assert.deepEqual(importTradesCsv(tradesToCsv(rebate.trades)), rebate.trades)

// A locally annotated full-account copy is a draft, never a frozen broker feed.
// Refreshes replace market data and keep only notes and genuinely local entries.
const publicRefresh = validateJournal(journal([
  trade('2', 'BUY', 2, 110, 1, { id: 'ibkr-kept', notes: '公开备注', realizedPnl: 0 }),
  trade('3', 'SELL', 1, 120, 0.5, { id: 'ibkr-new', realizedPnl: 9.5 }),
], {
  source: 'ibkr-connector', dayZero: '2026-10-02', updatedAt: '2026-10-05T12:00:00Z',
  cashflows: [{ id: 'ibkr-funding', date: '2026-10-02', type: 'DEPOSIT', amount: 5000, currency: 'USD' }],
  snapshots: [
    { id: 'ibkr-nav-2', date: '2026-10-02', netAssetValue: 5000, cash: 4780, currency: 'USD' },
    { id: 'ibkr-nav-3', date: '2026-10-03', netAssetValue: 5010, cash: 4900, currency: 'USD' },
  ],
  holdings: [{ symbol: 'TEST', instrumentLabel: 'Test equity', assetClass: 'STK', quantity: 1, averageCost: 110.5, currency: 'USD', marketValue: 120 }],
  holdingsDate: '2026-10-05', coverage: { start: '2026-10-02', end: '2026-10-05', complete: false, note: '最新覆盖说明' },
  dailyNotes: [
    { date: '2026-10-02', text: '公开旧日记', updatedAt: '2026-10-02T22:00:00Z' },
    { date: '2026-10-03', text: '公开较新的日记', updatedAt: '2026-10-05T12:00:00Z' },
  ],
}))
const annotatedDraft = validateJournal(journal([
  trade('1', 'BUY', 3, 90, 1, { id: 'ibkr-removed', notes: '已移除券商成交' }),
  trade('2', 'BUY', 1, 100, 2, { id: 'ibkr-kept', notes: '本地逐笔想法', realizedPnl: -42 }),
  trade('1', 'BUY', 1, 50, 0, { id: 'manual-before-dayzero' }),
  trade('4', 'BUY', 1, 50, 0, { id: 'manual-added', notes: '手工新增' }),
], {
  source: 'manual', dayZero: '2026-10-01', updatedAt: '2026-10-04T12:00:00Z',
  cashflows: [
    { id: 'ibkr-funding', date: '2026-10-02', type: 'DEPOSIT', amount: 4000, currency: 'USD' },
    { id: 'ibkr-removed-flow', date: '2026-10-02', type: 'DEPOSIT', amount: 1000, currency: 'USD' },
    { id: 'local-flow', date: '2026-10-04', type: 'WITHDRAWAL', amount: 20, currency: 'USD' },
  ],
  snapshots: [
    { id: 'local-old-date', date: '2026-10-01', netAssetValue: 4000, cash: 4000, currency: 'USD' },
    { id: 'local-same-date', date: '2026-10-02', netAssetValue: 4000, cash: 3900, currency: 'USD' },
    { id: 'ibkr-removed-nav', date: '2026-10-04', netAssetValue: 9999, cash: 9999, currency: 'USD' },
    { id: 'local-new-date', date: '2026-10-05', netAssetValue: 5030, cash: 4900, currency: 'USD' },
  ],
  holdings: [], holdingsDate: '2026-10-01',
  coverage: { start: '2026-10-01', end: '2026-10-03', complete: true, note: '本地旧覆盖' },
  dailyNotes: [
    { date: '2026-10-01', text: '起点之前不再保留', updatedAt: '2026-10-01T22:00:00Z' },
    { date: '2026-10-02', text: '本地较新的日记', updatedAt: '2026-10-04T12:00:00Z' },
    { date: '2026-10-03', text: '本地旧日记', updatedAt: '2026-10-03T12:00:00Z' },
    { date: '2026-10-04', text: '本地新增日记', updatedAt: '2026-10-04T12:00:00Z' },
  ],
}))
const merged = mergePublicWithDraft(publicRefresh, annotatedDraft)
assert.equal(merged.dayZero, '2026-10-02')
assert.equal(merged.source, 'ibkr-connector')
assert.deepEqual(merged.trades.map((entry) => entry.id), ['ibkr-kept', 'ibkr-new', 'manual-added'])
assert.equal(merged.trades[0].notes, '本地逐笔想法')
assert.equal(merged.trades[0].quantity, 2)
assert.equal(merged.trades[0].price, 110)
assert.equal(merged.trades[0].fee, 1)
assert.equal(merged.trades[0].realizedPnl, 0)
assert.deepEqual(merged.holdings, publicRefresh.holdings)
assert.equal(merged.holdingsDate, publicRefresh.holdingsDate)
assert.deepEqual(merged.coverage, publicRefresh.coverage)
assert.equal(merged.updatedAt, '2026-10-05T12:00:00.000Z')
assert.deepEqual(merged.snapshots.map((entry) => entry.id), ['ibkr-nav-2', 'ibkr-nav-3', 'local-new-date'])
assert.equal(merged.snapshots[0].netAssetValue, 5000)
assert.deepEqual(merged.cashflows.map((entry) => entry.id), ['ibkr-funding', 'local-flow'])
assert.equal(merged.cashflows[0].amount, 5000)
assert.deepEqual(merged.dailyNotes.map((entry) => entry.text), ['本地较新的日记', '公开较新的日记', '本地新增日记'])
assert.deepEqual(mergePublicWithDraft(publicRefresh, merged), merged)
assert.deepEqual(importJournalJson(JSON.stringify(merged)), merged)
assert.deepEqual(mergePublicWithDraft(createEmptyJournal(), annotatedDraft), annotatedDraft)
assert.deepEqual(mergePublicWithDraft({ ...createEmptyJournal(), dayZero: '2026-10-03' }, annotatedDraft).trades.map((entry) => entry.id), ['manual-added'])
const stricterDraft = { ...annotatedDraft, dayZero: '2026-10-03',
  trades: annotatedDraft.trades.filter((entry) => tradeDateKey(entry.executedAt) >= '2026-10-03'),
  cashflows: annotatedDraft.cashflows.filter((entry) => entry.date >= '2026-10-03'),
  snapshots: annotatedDraft.snapshots.filter((entry) => entry.date >= '2026-10-03'),
  dailyNotes: annotatedDraft.dailyNotes.filter((entry) => entry.date >= '2026-10-03'),
}
assert.equal(mergePublicWithDraft(publicRefresh, stricterDraft).dayZero, '2026-10-03')
assert.ok(mergePublicWithDraft(publicRefresh, stricterDraft).trades.every((entry) => tradeDateKey(entry.executedAt) >= '2026-10-03'))
const clearedNoteDraft = { ...annotatedDraft, trades: annotatedDraft.trades.map((entry) => entry.id === 'ibkr-kept' ? { ...entry, notes: '' } : entry) }
assert.equal(mergePublicWithDraft(publicRefresh, clearedNoteDraft).trades[0].notes, '')
assert.equal(mergePublicWithDraft(publicRefresh, mergePublicWithDraft(publicRefresh, clearedNoteDraft)).trades[0].notes, '')
const withoutPublicMetadata = { ...publicRefresh }
delete withoutPublicMetadata.holdings
delete withoutPublicMetadata.holdingsDate
delete withoutPublicMetadata.coverage
const withoutStaleMetadata = mergePublicWithDraft(withoutPublicMetadata, annotatedDraft)
assert.equal(withoutStaleMetadata.holdings, undefined)
assert.equal(withoutStaleMetadata.holdingsDate, undefined)
assert.equal(withoutStaleMetadata.coverage, undefined)
assert.throws(() => mergePublicWithDraft(publicRefresh, { ...createEmptyJournal(), baseCurrency: 'CNY' }), /基础币种不同/)
assert.throws(() => mergePublicWithDraft(publicRefresh, { ...createEmptyJournal(), source: 'demo' }), /演示账本/)

// With no manual additions, a later published balance is visible immediately.
const noteOnlyDraft = { ...annotatedDraft,
  trades: annotatedDraft.trades.filter((entry) => entry.id.startsWith('ibkr-')),
  snapshots: annotatedDraft.snapshots.filter((entry) => entry.id.startsWith('ibkr-')),
}
assert.equal(summarize(mergePublicWithDraft(publicRefresh, noteOnlyDraft)).nav, 5010)
assert.equal(summarize(mergePublicWithDraft(publicRefresh, noteOnlyDraft)).cash, 4900)
assert.equal(mergePublicWithDraft(publicRefresh, { ...noteOnlyDraft, updatedAt: '2026-10-06T00:00:00Z' }).updatedAt, '2026-10-06T00:00:00.000Z')

// The preview is deterministic, explicitly simulated and self-consistent.
const demo = validateJournal(createDemoJournal())
assert.equal(demo.source, 'demo')
assert.equal(demo.snapshots.length, 61)
assert.deepEqual(demo, validateJournal(createDemoJournal()))
assert.equal(summarize(demo).netContributions, 60000)
assert.ok(demo.trades.every((entry) => entry.notes.includes('模拟')))
near(demo.snapshots[0].netAssetValue, 49999)
console.log('Trading checks passed: fresh broker/draft merging, diary entries, execution P&L, costs, derivatives, holdings, cash, coverage, validation and CSV roundtrips.')
