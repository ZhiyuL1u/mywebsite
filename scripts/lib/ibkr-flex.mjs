import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const MAX_REPORT_BYTES = 20 * 1024 * 1024;
// The owner explicitly excluded earlier trading history from publication.
export const PUBLIC_DAY_ZERO = '2026-10-12';
const FLEX_BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/';
const RETRYABLE_CODES = new Set(['1001', '1004', '1005', '1006', '1007', '1008', '1009', '1019', '1021']);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: false,
});

export class JournalImportError extends Error {
  constructor(message, code) { super(message); this.name = 'JournalImportError'; if (code) this.code = code; }
}

function fail(message) { throw new JournalImportError(message); }
const array = (value) => value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value];
const digest = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
const text = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const shanghaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
export function publicationDate(value) { const parts = Object.fromEntries(shanghaiDate.formatToParts(new Date(executionTimestamp(value))).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
function cutoff(...values) { return [PUBLIC_DAY_ZERO, ...values.filter(Boolean).map((value) => isoDate(value, 'Day 0'))].sort().at(-1); }

function number(value, label, { positive = false, nonnegative = false } = {}) {
  const raw = text(value);
  if (!raw || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) fail(`${label} 缺失或不是有效数字。`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (positive && parsed <= 0) || (nonnegative && parsed < 0)) fail(`${label} 超出支持范围。`);
  return Object.is(parsed, -0) ? 0 : parsed;
}

function currency(value) {
  const result = text(value).toUpperCase();
  if (!/^[A-Z]{3}$/.test(result)) fail('币种缺失；请在查询中包含账户基础币种和每笔记录的币种。');
  return result;
}

export function isoDate(value, label = '日期') {
  const raw = text(value);
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(raw);
  if (!match) fail(`${label} 必须为 YYYY-MM-DD 或 YYYYMMDD。`);
  const result = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${result}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result) fail(`${label} 无效。`);
  return result;
}

function dateFromTimestamp(value, label) {
  const raw = text(value);
  return isoDate(raw.split(/[;T ]/)[0], label);
}

function zonedParts(epoch, formatter) {
  const result = {};
  for (const part of formatter.formatToParts(new Date(epoch))) if (part.type !== 'literal') result[part.type] = Number(part.value);
  return [result.year, result.month, result.day, result.hour, result.minute, result.second];
}

// Flex dates usually have no UTC offset. Resolve the configured report zone,
// including DST; reject ambiguous local times instead of moving a trade silently.
export function executionTimestamp(value, reportTimeZone) {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) {
    isoDate(raw.slice(0, 10), '成交日期');
    const epoch = Date.parse(raw);
    if (!Number.isFinite(epoch) || Number(raw.slice(11, 13)) > 23 || Number(raw.slice(14, 16)) > 59 || Number(raw.slice(17, 19)) > 59) fail('成交时间无效。');
    return new Date(epoch).toISOString();
  }
  const match = /^(\d{4})-?(\d{2})-?(\d{2})[; T](\d{2}):?(\d{2}):?(\d{2})$/.exec(raw);
  if (!match) fail('成交时间格式不支持；Flex 请使用 yyyyMMdd、HHmmss 和分号分隔。');
  isoDate(`${match[1]}-${match[2]}-${match[3]}`, '成交日期');
  const expected = match.slice(1).map(Number);
  if (expected[3] > 23 || expected[4] > 59 || expected[5] > 59) fail('成交时间无效。');
  if (!reportTimeZone) fail('缺少 IBKR_REPORT_TIME_ZONE；请显式填写与 Flex 报表一致的 IANA 时区。');
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: reportTimeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  } catch { fail('IBKR_REPORT_TIME_ZONE 不是有效的 IANA 时区。'); }
  const nominal = Date.UTC(expected[0], expected[1] - 1, expected[2], expected[3], expected[4], expected[5]);
  const candidates = new Set();
  for (const shift of [-86400000, 0, 86400000]) {
    const probe = nominal + shift;
    const local = zonedParts(probe, formatter);
    const offset = Date.UTC(local[0], local[1] - 1, local[2], local[3], local[4], local[5]) - probe;
    const candidate = nominal - offset;
    if (zonedParts(candidate, formatter).every((part, index) => part === expected[index])) candidates.add(candidate);
  }
  if (candidates.size !== 1) fail('成交时间落在夏令时歧义或不存在的时刻；请先核对原始报表时间。');
  return new Date([...candidates][0]).toISOString();
}

function parseXml(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > MAX_REPORT_BYTES) fail('Flex XML 为空或超过 20 MiB；请缩小日期范围。');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) fail('不支持包含 DTD 或外部实体的 XML。');
  if (XMLValidator.validate(xml) !== true) fail('Flex 返回的 XML 无效；没有修改本地账本。');
  try { return parser.parse(xml); } catch { fail('无法解析 Flex XML；没有修改本地账本。'); }
}

function requireSection(statement, key) {
  if (!Object.hasOwn(statement, key)) fail(`Flex 查询缺少 ${key} 区块；请按设置文档补齐字段。`);
  return statement[key];
}

function sameBase(value, base, label) {
  const actual = currency(value);
  if (actual !== base) fail(`${label} 含非基础币种；首版不自动换汇，请使用同一基础币种的股票账本。`);
  return actual;
}

function instrument(row, base) {
  const assetClass = text(row.assetCategory || row.assetClass).toUpperCase();
  if (!['STK', 'OPT'].includes(assetClass)) fail('发现不支持的外汇、期货或其他资产；Flex 自动导入仅支持股票和期权。');
  const multiplier = number(row.multiplier, '合约乘数', { positive: true });
  if (assetClass === 'STK' && multiplier !== 1) fail('股票合约乘数必须为 1。');
  sameBase(row.currency, base, '交易或持仓');
  if (text(row.fxRateToBase) && number(row.fxRateToBase, '基础币种汇率') !== 1) fail('发现需要换汇的记录；首版不自动换汇。');
  const symbol = publicLabel(row.underlyingSymbol || row.symbol, '股票或标的代码', 100);
  let instrumentLabel = publicLabel(row.description || row.symbol, '合约名称', 500);
  if (assetClass === 'OPT') {
    const expiry = isoDate(row.expiry, '期权到期日');
    const strike = number(row.strike, '期权行权价', { nonnegative: true });
    const putCall = text(row.putCall).toUpperCase();
    if (!['P', 'C', 'PUT', 'CALL'].includes(putCall)) fail('期权缺少 Put/Call；无法识别完整合约。');
    instrumentLabel = `${symbol} ${expiry} ${putCall.startsWith('P') ? 'PUT' : 'CALL'} ${strike} ×${multiplier}`;
  }
  return { assetClass, multiplier, symbol, instrumentLabel };
}

function publicLabel(value, label, max = 500) {
  const result = text(value);
  if (!result || result.length > max || /[\u0000-\u001f]/.test(result) || /\b[UFD]\d{5,}\b/i.test(result) || /(?:token|account(?:id|number)?)[\s=:]+\S+/i.test(result)) fail(`${label} 缺失、过长或包含非公开标识。`);
  return result;
}

function ensureUnique(rows, label) {
  const result = new Map();
  for (const row of rows) {
    if (result.has(row.id) && JSON.stringify(result.get(row.id)) !== JSON.stringify(row)) fail(`${label} 出现相同 ID 的冲突记录；请核对报表明细级别。`);
    result.set(row.id, row);
  }
  return [...result.values()];
}

export function emptyJournal(baseCurrency = 'USD') {
  return { version: 1, dayZero: null, baseCurrency: currency(baseCurrency), updatedAt: null, source: 'manual', trades: [], cashflows: [], snapshots: [] };
}

export function parseActivityReport(xml, { baseCurrency, reportTimeZone, dayZero, eligibleSymbols = [], eligibleInstruments = [] } = {}) {
  const document = parseXml(xml);
  const root = document.FlexQueryResponse;
  if (!root || text(root.type).toUpperCase() !== 'AF') fail('需要 XML 格式的 Activity Flex Query（AF），不能使用成交确认、CSV 或 HTML。');
  const statements = array(root.FlexStatements?.FlexStatement);
  if (!statements.length) fail('Activity Flex 报表没有账户报告；请核对账户选择和日期范围。');
  const accounts = new Set(statements.map((statement) => text(statement.accountId)));
  if (accounts.size !== 1 || accounts.has('')) fail('首版每个账本仅支持一个账户；请让 Flex 查询只选择自己的一个账户。');
  const account = [...accounts][0];
  const accountKey = digest(account).slice(0, 16);
  const detected = new Set(statements.flatMap((statement) => array(requireSection(statement, 'AccountInformation')).map((row) => text(row.currency || row.baseCurrency || statement.baseCurrency)).filter(Boolean)));
  if (detected.size > 1) fail('账户基础币种在报告期间发生变化；请分开核对后导入。');
  const base = currency(baseCurrency || [...detected][0]);
  if (detected.size && currency([...detected][0]) !== base) fail('TRADING_BASE_CURRENCY 与 IBKR 账户基础币种不一致。');
  const publishFrom = cutoff(dayZero);
  const result = { ...emptyJournal(base), source: 'ibkr-flex', dayZero: publishFrom };

  for (const statement of statements) {
    const tradeSection = requireSection(statement, 'Trades');
    const cashSection = requireSection(statement, 'CashTransactions');
    const equitySection = requireSection(statement, 'EquitySummaryInBase');
    const cashReportSection = requireSection(statement, 'CashReport');
    const positionsSection = requireSection(statement, 'OpenPositions');
    if (['Order', 'SymbolSummary', 'AssetClass', 'ClosedLot', 'WashSale'].some((key) => tradeSection && Object.hasOwn(tradeSection, key))) fail('Trades 含汇总或订单记录；请只选择 Executions，避免遗漏或重复。');
    for (const row of array(tradeSection?.Trade)) {
      const executedAt = executionTimestamp(row.dateTime, reportTimeZone);
      if (publicationDate(executedAt) < publishFrom) continue;
      const level = text(row.levelOfDetail).toUpperCase();
      if (level !== 'EXECUTION' && level !== 'EXECUTIONS') fail('Trades 必须只导出 Executions 明细，并包含 Level of Detail 字段。');
      const security = instrument(row, base);
      if ((text(row.origTradeID || row.originalTradeID) && text(row.origTradeID || row.originalTradeID) !== '0') || /CANCEL|CORRECT|ADJUST/i.test(text(row.transactionType)) || /(?:^|[;,\s])(?:Ca|Co)(?:$|[;,\s])/.test(text(row.notes))) fail('发现取消或更正成交；自动导入已停止，请先核对旧记录，避免重复记账。');
      const sourceId = text(row.ibExecID || row.ibExecutionID || row.tradeID);
      if (!sourceId) fail('成交缺少 IB Execution ID / Trade ID；请补齐稳定 ID 字段。');
      const side = ({ BUY: 'BUY', B: 'BUY', SELL: 'SELL', S: 'SELL' })[text(row.buySell).toUpperCase()];
      if (!side) fail('成交缺少有效的 Buy/Sell 字段。');
      const commission = number(row.ibCommission, 'IB Commission');
      if (commission !== 0) sameBase(row.ibCommissionCurrency, base, '佣金');
      const taxValue = text(row.taxes) ? number(row.taxes, '交易税费') : 0;
      const quantity = Math.abs(number(row.quantity, '成交数量'));
      const price = number(row.tradePrice, '成交价格', { nonnegative: true });
      const grossAmount = quantity * price * security.multiplier;
      if (!Number.isFinite(grossAmount)) fail('合约成交金额超出支持范围。');
      const positionEffect = ({ O: 'OPEN', C: 'CLOSE', OPEN: 'OPEN', CLOSE: 'CLOSE' })[text(row.openCloseIndicator).toUpperCase()] || 'UNKNOWN';
      result.trades.push({
        id: text(row.ibExecID || row.ibExecutionID) ? `ibkr-${identifier(sourceId)}` : `ibkr-trade-${accountKey}-${digest(sourceId)}`,
        executedAt, symbol: security.symbol, side, quantity, price,
        fee: -commission - taxValue,
        currency: base,
        assetClass: security.assetClass, grossAmount, instrumentLabel: security.instrumentLabel, positionEffect,
        ...(text(row.fifoPnlRealized) ? { realizedPnl: number(row.fifoPnlRealized, '经纪商已实现盈亏') } : {}),
      });
      if (result.trades.at(-1).quantity === 0) fail('成交数量必须大于 0。');
    }
    for (const row of array(cashSection?.CashTransaction)) {
      const date = dateFromTimestamp(row.dateTime || row.reportDate, '现金交易日期');
      if (date < publishFrom) continue;
      const kind = text(row.type).toUpperCase().replace(/\s+/g, '');
      if (!['DEPOSIT', 'DEPOSITS', 'WITHDRAWAL', 'WITHDRAWALS', 'DEPOSITS/WITHDRAWALS', 'DEPOSITS&WITHDRAWALS'].includes(kind)) continue;
      sameBase(row.currency, base, '入出金');
      const amount = number(row.amount, '入出金金额');
      if (!amount) fail('入出金金额为 0；请核对现金交易明细。');
      const direction = kind.startsWith('WITHDRAWAL') ? 'WITHDRAWAL' : kind === 'DEPOSIT' || kind === 'DEPOSITS' ? 'DEPOSIT' : amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL';
      if ((direction === 'DEPOSIT' && amount < 0) || (direction === 'WITHDRAWAL' && amount > 0)) fail('入出金类型与金额方向不一致；请核对原始记录。');
      const sourceId = text(row.transactionID || row.transactionId);
      if (!sourceId) fail('入出金缺少 Transaction ID；请导出该字段，避免相同金额重复或遗漏。');
      result.cashflows.push({ id: `ibkr-cash-${accountKey}-${digest(sourceId)}`, date, type: direction, amount: Math.abs(amount), currency: base });
    }
    const cashReports = array(cashReportSection?.CashReportCurrency);
    for (const row of cashReports) {
      if (isoDate(row.toDate || row.reportDate, '现金报表日期') < publishFrom) continue;
      const code = text(row.currency).toUpperCase();
      if (code !== 'BASE_SUMMARY' && code !== base && Math.abs(number(row.endingCash, '外币现金余额')) > 0.00000001) fail('发现外币现金余额；首版不自动换汇，请先核对多币种账户。');
    }
    const equities = array(equitySection?.EquitySummaryByReportDateInBase);
    if (!equities.length) fail('NAV 区块缺少 EquitySummaryByReportDateInBase；请导出 Report Date、Cash、Total。');
    for (const row of equities) {
      const date = isoDate(row.reportDate, '净值快照日期');
      if (date < publishFrom) continue;
      const matchingCash = cashReports.filter((cashRow) => isoDate(cashRow.toDate || cashRow.reportDate, '现金报表日期') === date);
      const selectedCash = matchingCash.find((cashRow) => text(cashRow.currency).toUpperCase() === 'BASE_SUMMARY') || matchingCash.find((cashRow) => text(cashRow.currency).toUpperCase() === base);
      if (!selectedCash) fail('NAV 快照缺少同日基础币种现金余额；请导出 Cash Report 的 Currency、To Date、Ending Cash。');
      const cash = number(selectedCash.endingCash, '现金余额');
      const navCash = number(row.cash, 'NAV Cash');
      if (Math.abs(cash - navCash) > Math.max(0.02, Math.abs(navCash) * 1e-8)) fail('NAV Cash 与 Cash Report 余额不一致；请确认都采用交易日口径。');
      result.snapshots.push({ id: `ibkr-snapshot-${accountKey}-${date}`, date, netAssetValue: number(row.total, '账户净值'), cash, currency: base });
    }
    const positionDates = [...new Set(array(positionsSection?.OpenPosition).map((row) => text(row.reportDate)).filter(Boolean).map((date) => isoDate(date, '持仓快照日期')))];
    if (positionDates.length > 1) fail('持仓区块含不同报告日期；不能将其合并为同一时点快照。');
    const holdingsDate = positionDates[0] || equities.map((row) => isoDate(row.reportDate, '持仓快照日期')).sort().at(-1);
    if (holdingsDate >= publishFrom && (!result.holdingsDate || holdingsDate >= result.holdingsDate)) {
      const holdings = [];
      const allowedSymbols = new Set([...eligibleSymbols, ...result.trades.filter((row) => row.side === 'BUY').map((row) => row.symbol)]);
      for (const row of array(positionsSection?.OpenPosition)) {
        if (!allowedSymbols.has(text(row.underlyingSymbol || row.symbol))) continue;
        if (text(row.levelOfDetail).toUpperCase() !== 'SUMMARY') fail('Open Positions 必须只导出 Summary；不能混入 Lots。');
        const security = instrument(row, base);
        const quantity = number(row.position ?? row.quantity, '持仓数量');
        if (!quantity) continue;
        holdings.push({ symbol: security.symbol, instrumentLabel: security.instrumentLabel, assetClass: security.assetClass, quantity, averageCost: Math.abs(number(row.costBasisMoney, '持仓成本金额') / quantity / security.multiplier), currency: base, marketValue: number(row.positionValue, '持仓市值'), ...(text(row.fifoPnlUnrealized) ? { unrealizedPnl: number(row.fifoPnlUnrealized, '持仓未实现盈亏') } : {}) });
      }
      result.holdings = holdings;
      result.holdingsDate = holdingsDate;
    }
  }
  result.trades = ensureUnique(result.trades, '成交');
  result.cashflows = ensureUnique(result.cashflows, '入出金');
  result.snapshots = ensureUnique(result.snapshots, '净值快照');
  return normalizeJournal(result, { eligibleSymbols, eligibleInstruments });
}

function identifier(value) {
  const result = text(value);
  if (!result || result.length > 160 || !/^[\w:.-]+$/.test(result)) fail('账本记录 ID 无效。');
  return result;
}

function optionalNotes(row) {
  if (row.notes === undefined) return {};
  if (typeof row.notes !== 'string' || row.notes.length > 10000) fail('交易备注格式无效。');
  return { notes: row.notes };
}

// This projection is the only output shape: no raw XML, account identifiers,
// broker descriptions, credentials or arbitrary imported properties survive.
export function normalizeJournal(value, { eligibleSymbols = [], eligibleInstruments = [] } = {}) {
  if (!value || value.version !== 1 || !['manual', 'ibkr-flex', 'ibkr-connector', 'demo'].includes(value.source)) fail('账本版本或来源无效。');
  if (!Array.isArray(value.trades) || !Array.isArray(value.cashflows) || !Array.isArray(value.snapshots)) fail('账本必须包含 trades、cashflows、snapshots 数组。');
  const base = currency(value.baseCurrency);
  const publishFrom = cutoff(value.dayZero);
  const journal = { version: 1, dayZero: publishFrom, baseCurrency: base, updatedAt: null, source: value.source, trades: [], cashflows: [], snapshots: [] };
  if (value.updatedAt !== null) journal.updatedAt = executionTimestamp(value.updatedAt);
  journal.trades = ensureUnique(value.trades.filter((row) => publicationDate(row.executedAt) >= publishFrom).map((row) => {
    if (!['BUY', 'SELL'].includes(row.side)) fail('账本成交方向无效。');
    if (row.assetClass !== undefined && !['STK', 'OPT', 'FUT', 'FOP', 'CASH', 'OTHER'].includes(row.assetClass)) fail('账本资产类别无效。');
    if (row.positionEffect !== undefined && !['OPEN', 'CLOSE', 'UNKNOWN'].includes(row.positionEffect)) fail('账本开平仓状态无效。');
    return { id: identifier(row.id), executedAt: executionTimestamp(row.executedAt), symbol: publicLabel(row.symbol, '标的代码', 100), side: row.side, quantity: number(row.quantity, '成交数量', { positive: true }), price: number(row.price, '成交价格', { nonnegative: true }), fee: number(row.fee, '成交费用'), currency: sameBase(row.currency, base, '账本成交'), ...optionalNotes(row), ...(row.assetClass !== undefined ? { assetClass: row.assetClass } : {}), ...(row.grossAmount !== undefined ? { grossAmount: number(row.grossAmount, '成交总额', { nonnegative: true }) } : {}), ...(row.instrumentLabel !== undefined ? { instrumentLabel: publicLabel(row.instrumentLabel, '合约名称') } : {}), ...(row.realizedPnl !== undefined ? { realizedPnl: number(row.realizedPnl, '已实现盈亏') } : {}), ...(row.positionEffect !== undefined ? { positionEffect: row.positionEffect } : {}) };
  }), '成交').sort((a, b) => a.executedAt.localeCompare(b.executedAt) || a.id.localeCompare(b.id));
  journal.cashflows = ensureUnique(value.cashflows.filter((row) => isoDate(row.date) >= publishFrom).map((row) => {
    if (!['DEPOSIT', 'WITHDRAWAL'].includes(row.type)) fail('账本入出金类型无效。');
    return { id: identifier(row.id), date: isoDate(row.date), type: row.type, amount: number(row.amount, '入出金金额', { positive: true }), currency: sameBase(row.currency, base, '账本入出金'), ...optionalNotes(row) };
  }), '入出金').sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  journal.snapshots = ensureUnique(value.snapshots.filter((row) => isoDate(row.date) >= publishFrom).map((row) => ({ id: identifier(row.id), date: isoDate(row.date), netAssetValue: number(row.netAssetValue, '账户净值'), cash: row.cash === null ? null : number(row.cash, '现金余额'), currency: sameBase(row.currency, base, '账本快照') })), '净值快照').sort((a, b) => a.date.localeCompare(b.date));
  if (new Set(journal.snapshots.map((row) => row.date)).size !== journal.snapshots.length) fail('同一日期存在多个净值快照；首版每个日期只支持一个账户总值。');
  if (value.dailyNotes !== undefined) {
    if (!Array.isArray(value.dailyNotes)) fail('dailyNotes 必须为数组。');
    journal.dailyNotes = value.dailyNotes.filter((row) => isoDate(row.date) >= publishFrom).map((row) => {
      if (typeof row.text !== 'string' || row.text.length > 5000) fail('每日日记正文无效。');
      return { date: isoDate(row.date), text: row.text, updatedAt: executionTimestamp(row.updatedAt) };
    }).sort((a, b) => a.date.localeCompare(b.date));
    if (new Set(journal.dailyNotes.map((row) => row.date)).size !== journal.dailyNotes.length) fail('同一日期存在多篇每日日记。');
  }
  if (value.holdings !== undefined) {
    if (!Array.isArray(value.holdings)) fail('holdings 必须为数组。');
    const holdingsDate = isoDate(value.holdingsDate, '持仓日期');
    const allowed = new Set([...eligibleSymbols, ...journal.trades.filter((row) => row.side === 'BUY').map((row) => row.symbol)]);
    const contracts = new Set([...eligibleInstruments, ...journal.trades.filter((row) => row.side === 'BUY' && row.instrumentLabel).map((row) => row.instrumentLabel)]);
    if (holdingsDate >= publishFrom) {
      journal.holdingsDate = holdingsDate;
      journal.holdings = value.holdings.filter((row) => allowed.has(text(row.symbol))).map((row) => ({ symbol: publicLabel(row.symbol, '持仓标的', 100), instrumentLabel: publicLabel(row.instrumentLabel, '持仓合约'), assetClass: publicLabel(row.assetClass, '持仓资产类别', 30), quantity: number(row.quantity, '持仓数量'), averageCost: number(row.averageCost, '持仓均价'), currency: sameBase(row.currency, base, '持仓'), marketValue: number(row.marketValue, '持仓市值'), ...(row.unrealizedPnl !== undefined && (row.assetClass !== 'OPT' || contracts.has(row.instrumentLabel)) ? { unrealizedPnl: number(row.unrealizedPnl, '未实现盈亏') } : {}) }));
    }
  }
  if (value.coverage !== undefined) {
    if (!value.coverage || typeof value.coverage.complete !== 'boolean') fail('覆盖范围格式无效。');
    const start = cutoff(value.coverage.start, publishFrom);
    const end = isoDate(value.coverage.end, '覆盖截止日');
    if (end >= start) journal.coverage = { start, end, complete: value.coverage.complete, note: publicLabel(value.coverage.note, '覆盖说明', 2000) };
  }
  return journal;
}

export function mergeJournals(existing, imported, { dayZero, now = new Date().toISOString() } = {}) {
  const previous = normalizeJournal(existing);
  const next = normalizeJournal(imported, { eligibleSymbols: previous.trades.filter((row) => row.side === 'BUY').map((row) => row.symbol), eligibleInstruments: previous.trades.filter((row) => row.side === 'BUY' && row.instrumentLabel).map((row) => row.instrumentLabel) });
  if (previous.baseCurrency !== next.baseCurrency) fail('导入数据与已有账本的基础币种不一致。');
  const accountKeys = new Set([...previous.trades, ...previous.cashflows, ...previous.snapshots, ...next.trades, ...next.cashflows, ...next.snapshots].map((row) => /^ibkr-(?:trade|cash|snapshot)-([a-f0-9]{16})-/.exec(row.id)?.[1]).filter(Boolean));
  if (accountKeys.size > 1) fail('报表账户与已有 IBKR 账本不一致；请勿把不同账户合并到同一个账本。');
  if (previous.source === 'demo' && (previous.trades.length || previous.cashflows.length || previous.snapshots.length)) fail('请先清空演示账本，再导入真实记录。');
  const merge = (before, after, key = 'id') => {
    const records = new Map(before.map((row) => [row[key], row]));
    for (const row of after) {
      const saved = records.get(row[key]);
      records.set(row[key], { ...saved, ...row, ...(saved?.notes !== undefined ? { notes: saved.notes } : {}) });
    }
    return [...records.values()];
  };
  const publishFrom = cutoff(dayZero, previous.dayZero, next.dayZero);
  const merged = { version: 1, dayZero: publishFrom, baseCurrency: next.baseCurrency, updatedAt: now, source: 'ibkr-flex', trades: merge(previous.trades, next.trades), cashflows: merge(previous.cashflows, next.cashflows), snapshots: merge(previous.snapshots, next.snapshots, 'date'), dailyNotes: merge(previous.dailyNotes || [], next.dailyNotes || [], 'date') };
  const holdings = next.holdings !== undefined && (!previous.holdingsDate || next.holdingsDate >= previous.holdingsDate) ? next : previous;
  if (holdings.holdings !== undefined) { merged.holdings = holdings.holdings; merged.holdingsDate = holdings.holdingsDate; }
  const latest = [...merged.trades.map((row) => publicationDate(row.executedAt)), ...merged.cashflows.map((row) => row.date), ...merged.snapshots.map((row) => row.date)].sort().at(-1);
  if (latest && latest >= publishFrom) merged.coverage = { start: publishFrom, end: latest, complete: false, note: '自 Day 0 起记录成交与每日复盘；持仓仅展示本期有买入记录的标的，账户净值和现金为账户总额。历史完整性待报表核对。' };
  return normalizeJournal(merged);
}

export function dateRanges(from, to, { daily = false } = {}) {
  const start = isoDate(from, '开始日期');
  const end = isoDate(to, '结束日期');
  if (start > end) fail('开始日期不能晚于结束日期。');
  const result = [];
  const endMs = Date.parse(`${end}T00:00:00Z`);
  for (let cursor = Date.parse(`${start}T00:00:00Z`); cursor <= endMs;) {
    const last = Math.min(endMs, cursor + (daily ? 0 : 364) * 86400000);
    if (!daily || ![0, 6].includes(new Date(cursor).getUTCDay())) result.push({ from: new Date(cursor).toISOString().slice(0, 10), to: new Date(last).toISOString().slice(0, 10) });
    cursor = last + 86400000;
  }
  return result;
}

function flexResponse(xml) {
  const parsed = parseXml(xml);
  if (parsed.FlexQueryResponse) return { report: xml };
  const result = parsed.FlexStatementResponse;
  if (!result) fail('IBKR 返回了无法识别的响应；没有修改账本。');
  const code = text(result.ErrorCode);
  if (code && !/^\d{4}$/.test(code)) fail('IBKR 返回了无法识别的错误；没有修改账本。');
  return { success: text(result.Status) === 'Success', reference: text(result.ReferenceCode), code };
}

function brokerError(code) {
  const known = { 1012: 'IBKR Flex Token 已过期，请重新配置 Secret。', 1013: 'IBKR Flex IP 限制不匹配，请核对服务器出口 IP。', 1014: 'IBKR Activity Query ID 无效，请核对查询设置。', 1015: 'IBKR Flex Token 无效，请重新配置 Secret。', 1018: 'IBKR 请求频率受限，请稍后再试。' };
  throw new JournalImportError(known[code] || `IBKR 报表暂不可用${code ? `（错误 ${code}）` : ''}；没有修改账本，请稍后重试。`, code);
}

export function createFlexClient({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), clock = () => Date.now() } = {}) {
  let lastRequest = -Infinity;
  async function request(endpoint, params, retryDelay = 0) {
    const wait = Math.max(retryDelay, 6500 - (clock() - lastRequest));
    if (wait > 0) await sleep(wait);
    lastRequest = clock();
    const url = new URL(endpoint, FLEX_BASE);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response;
    try { response = await fetchImpl(url, { method: 'GET', redirect: 'error', headers: { 'User-Agent': 'ZhiyuTradingJournal/1.0', Accept: 'application/xml,text/xml,text/plain' }, signal: AbortSignal.timeout(20000) }); }
    catch { fail('无法连接 IBKR 或请求超时；没有修改账本，请稍后重试。'); }
    if (!response.ok) fail(`IBKR HTTP ${Number(response.status) || 0}；没有修改账本，请稍后重试。`);
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > MAX_REPORT_BYTES) fail('Flex 报表超过 20 MiB；请缩小日期范围。');
        chunks.push(Buffer.from(chunk));
      }
    } catch (error) {
      if (error instanceof JournalImportError) throw error;
      fail('读取 IBKR 响应失败；没有修改账本，请稍后重试。');
    }
    return flexResponse(Buffer.concat(chunks).toString('utf8'));
  }
  return {
    async report({ token, queryId, from, to }) {
      if (!/^\d{10,100}$/.test(text(token))) fail('缺少有效的 IBKR_FLEX_TOKEN；请配置为服务端 Secret。');
      if (!/^\d{1,20}$/.test(text(queryId))) fail('缺少有效的 IBKR_ACTIVITY_QUERY_ID；请配置 Activity 查询 ID。');
      const params = { t: String(token), q: String(queryId), v: '3' };
      if (from || to) {
        if (!from || !to || dateRanges(from, to).length !== 1) fail('每次 IBKR 请求必须同时提供开始／结束日期，范围不超过 365 天。');
        params.fd = isoDate(from).replaceAll('-', '');
        params.td = isoDate(to).replaceAll('-', '');
      }
      const generated = await request('SendRequest', params);
      if (!generated.success || !/^\d{1,50}$/.test(generated.reference)) brokerError(generated.code);
      // Deliberately ignore IBKR's response URL. Only the fixed HTTPS origin is used.
      for (let attempt = 0; attempt < 5; attempt++) {
        const retrieved = await request('GetStatement', { t: String(token), q: generated.reference, v: '3' }, attempt ? Math.min(6500 * 2 ** attempt, 30000) : 6500);
        if (retrieved.report) return retrieved.report;
        if (!RETRYABLE_CODES.has(retrieved.code) || attempt === 4) brokerError(retrieved.code);
      }
      fail('IBKR 报表尚未生成；请稍后重试。');
    },
  };
}
