export type TradeSide = 'BUY' | 'SELL'
export type JournalSource = 'manual' | 'ibkr-flex' | 'ibkr-connector' | 'demo'
export type AssetClass = 'STK' | 'OPT' | 'FUT' | 'FOP' | 'CASH' | 'OTHER'
export type PositionEffect = 'OPEN' | 'CLOSE' | 'UNKNOWN'

export interface Trade {
  id: string
  executedAt: string
  symbol: string
  side: TradeSide
  quantity: number
  price: number
  /** Positive is an execution cost; negative is a broker rebate. */
  fee: number
  currency: string
  notes?: string
  assetClass?: AssetClass
  /** Absolute broker-reported amount before fees; includes contract multipliers. */
  grossAmount?: number
  instrumentLabel?: string
  /** Authoritative broker execution P&L. Missing is unknown; zero is known. */
  realizedPnl?: number
  positionEffect?: PositionEffect
}

export interface Cashflow {
  id: string
  date: string
  type: 'DEPOSIT' | 'WITHDRAWAL'
  amount: number
  currency: string
  notes?: string
}

export interface Snapshot {
  id: string
  date: string
  netAssetValue: number
  cash: number | null
  currency: string
}

export interface Holding {
  symbol: string
  instrumentLabel: string
  assetClass: string
  quantity: number
  averageCost: number
  currency: string
  marketValue: number
  unrealizedPnl?: number
}

export interface HistoryCoverage {
  start: string
  end: string
  complete: boolean
  note: string
}

export interface DailyNote {
  date: string
  text: string
  updatedAt: string
}

export interface Journal {
  version: 1
  dayZero: string | null
  baseCurrency: string
  updatedAt: string | null
  source: JournalSource
  trades: Trade[]
  cashflows: Cashflow[]
  snapshots: Snapshot[]
  /** Presence, including an empty array, means these are authoritative holdings. */
  holdings?: Holding[]
  holdingsDate?: string
  coverage?: HistoryCoverage
  dailyNotes?: DailyNote[]
}

export interface Position {
  symbol: string
  quantity: number
  averageCost: number
  currency: string
  marketValue?: number
  assetClass?: string
  instrumentLabel?: string
  unrealizedPnl?: number
}

export interface JournalSummary {
  nav: number | null
  cash: number | null
  netContributions: number
  totalPnl: number | null
  /** Simple P&L / net contributions, not a time-weighted or annualized return. */
  totalReturn: number | null
  realizedPnl: number | null
  fees: number
  tradeCount: number
  valuationDate: string | null
  hasFundingBaseline: boolean
  realizedPnlIsComplete: boolean
}

export function createEmptyJournal(): Journal {
  return {
    version: 1,
    dayZero: null,
    baseCurrency: 'USD',
    updatedAt: null,
    source: 'manual',
    trades: [],
    cashflows: [],
    snapshots: [],
    dailyNotes: [],
  }
}

/** Calendar dates in this journal use UTC+8, matching the site's date inputs. */
export function tradeDateKey(executedAt: string): string {
  const time = Date.parse(executedAt)
  if (!Number.isFinite(time)) throw new Error('成交时间不是有效时间。')
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}必须是对象。`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error(`${label}必须是 1–${max} 个字符的文本。`)
  }
  return value.trim()
}

function finite(value: unknown, label: string, minimum?: number, exclusive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label}必须是有效数字。`)
  }
  if (minimum !== undefined && (exclusive ? value <= minimum : value < minimum)) {
    throw new Error(`${label}必须${exclusive ? '大于' : '大于或等于'} ${minimum}。`)
  }
  return value
}

function date(value: unknown, label: string): string {
  const result = string(value, label, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error(`${label}格式应为 YYYY-MM-DD。`)
  }
  const parsed = new Date(`${result}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`${label}不是有效日期。`)
  }
  return result
}

function timestamp(value: unknown, label: string): string {
  const result = string(value, label, 60)
  const match = result.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/i)
  if (!match) {
    throw new Error(`${label}须包含时区，例如 2026-10-19T09:30:00-04:00。`)
  }
  date(match[1], label)
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) {
    throw new Error(`${label}不是有效时间。`)
  }
  const parsed = new Date(result)
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label}不是有效时间。`)
  return parsed.toISOString()
}

function currency(value: unknown, label: string): string {
  const result = string(value, label, 3).toUpperCase()
  if (!/^[A-Z]{3}$/.test(result)) throw new Error(`${label}应为三位币种代码，例如 USD。`)
  return result
}

function notes(value: unknown, label: string): { notes?: string } {
  // An explicitly empty note is a local deletion marker during broker refreshes.
  if (value === undefined) return {}
  if (typeof value !== 'string' || value.length > 10000) {
    throw new Error(`${label}须为不超过 10000 个字符的文本。`)
  }
  return { notes: value }
}

function validateTrade(value: unknown, label: string): Trade {
  const item = record(value, label)
  const side = item.side
  if (side !== 'BUY' && side !== 'SELL') throw new Error(`${label}方向必须为 BUY 或 SELL。`)
  if (item.assetClass !== undefined && (typeof item.assetClass !== 'string' ||
    !['STK', 'OPT', 'FUT', 'FOP', 'CASH', 'OTHER'].includes(item.assetClass))) {
    throw new Error(`${label}资产类别必须为 STK、OPT、FUT、FOP、CASH 或 OTHER。`)
  }
  if (item.positionEffect !== undefined && (typeof item.positionEffect !== 'string' ||
    !['OPEN', 'CLOSE', 'UNKNOWN'].includes(item.positionEffect))) {
    throw new Error(`${label}开平仓状态必须为 OPEN、CLOSE 或 UNKNOWN。`)
  }
  return {
    id: string(item.id, `${label} ID`),
    executedAt: timestamp(item.executedAt, `${label}时间`),
    symbol: string(item.symbol, `${label}代码`, 100).toUpperCase(),
    side,
    quantity: finite(item.quantity, `${label}数量`, 0, true),
    price: finite(item.price, `${label}成交价`, 0),
    fee: finite(item.fee, `${label}手续费`),
    currency: currency(item.currency, `${label}币种`),
    ...notes(item.notes, `${label}备注`),
    ...(item.assetClass !== undefined ? { assetClass: item.assetClass as AssetClass } : {}),
    ...(item.grossAmount !== undefined ? { grossAmount: finite(item.grossAmount, `${label}成交总额`, 0) } : {}),
    ...(item.instrumentLabel !== undefined ? { instrumentLabel: string(item.instrumentLabel, `${label}合约名称`, 500) } : {}),
    ...(item.realizedPnl !== undefined ? { realizedPnl: finite(item.realizedPnl, `${label}券商已实现盈亏`) } : {}),
    ...(item.positionEffect !== undefined ? { positionEffect: item.positionEffect as PositionEffect } : {}),
  }
}

function validateCashflow(value: unknown, label: string): Cashflow {
  const item = record(value, label)
  const type = item.type
  if (type !== 'DEPOSIT' && type !== 'WITHDRAWAL') {
    throw new Error(`${label}类型必须为 DEPOSIT 或 WITHDRAWAL。`)
  }
  return {
    id: string(item.id, `${label} ID`),
    date: date(item.date, `${label}日期`),
    type,
    amount: finite(item.amount, `${label}金额`, 0, true),
    currency: currency(item.currency, `${label}币种`),
    ...notes(item.notes, `${label}备注`),
  }
}

function validateSnapshot(value: unknown, label: string): Snapshot {
  const item = record(value, label)
  return {
    id: string(item.id, `${label} ID`),
    date: date(item.date, `${label}日期`),
    netAssetValue: finite(item.netAssetValue, `${label}净资产`),
    cash: item.cash === null ? null : finite(item.cash, `${label}现金余额`),
    currency: currency(item.currency, `${label}币种`),
  }
}

function validateHolding(value: unknown, label: string): Holding {
  const item = record(value, label)
  return {
    symbol: string(item.symbol, `${label}代码`, 100).toUpperCase(),
    instrumentLabel: string(item.instrumentLabel, `${label}合约名称`, 500),
    assetClass: string(item.assetClass, `${label}资产类别`, 30),
    quantity: finite(item.quantity, `${label}数量`),
    averageCost: finite(item.averageCost, `${label}平均成本`),
    currency: currency(item.currency, `${label}币种`),
    marketValue: finite(item.marketValue, `${label}市值`),
    ...(item.unrealizedPnl !== undefined ? { unrealizedPnl: finite(item.unrealizedPnl, `${label}未实现盈亏`) } : {}),
  }
}

function validateCoverage(value: unknown): HistoryCoverage {
  const item = record(value, '历史覆盖范围')
  if (typeof item.complete !== 'boolean') throw new Error('历史覆盖完整性必须为布尔值。')
  const start = date(item.start, '历史起始日')
  const end = date(item.end, '历史截止日')
  if (start > end) throw new Error('历史起始日不能晚于截止日。')
  return { start, end, complete: item.complete, note: string(item.note, '历史覆盖说明', 2000) }
}

function validateDailyNote(value: unknown, label: string): DailyNote {
  const item = record(value, label)
  if (typeof item.text !== 'string' || item.text.length > 5000) {
    throw new Error(`${label}正文须为不超过 5000 个字符的文本。`)
  }
  return {
    date: date(item.date, `${label}日期`),
    text: item.text,
    updatedAt: timestamp(item.updatedAt, `${label}更新时间`),
  }
}

function list<T>(value: unknown, label: string, validate: (entry: unknown, label: string) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组。`)
  if (value.length > 100000) throw new Error(`${label}最多支持 100000 条记录，请分批整理。`)
  return value.map((entry, index) => validate(entry, `${label}第 ${index + 1} 条`))
}

function uniqueIds(items: { id: string }[], label: string): void {
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label}存在重复 ID：${item.id}。`)
    ids.add(item.id)
  }
}

function assertBaseCurrency(journal: Journal): void {
  const mismatch = [...journal.trades, ...journal.cashflows, ...journal.snapshots, ...(journal.holdings ?? [])]
    .find((item) => item.currency !== journal.baseCurrency)
  if (mismatch) {
    throw new Error(`账本币种为 ${journal.baseCurrency}，记录中包含 ${mismatch.currency}。当前不自动换汇，请先将报表统一为基础币种。`)
  }
}

export function validateJournal(value: unknown): Journal {
  const item = record(value, '账本')
  if (item.version !== 1) throw new Error('不支持此账本版本，目前仅支持 version: 1。')
  if (item.source !== 'manual' && item.source !== 'ibkr-flex' && item.source !== 'ibkr-connector' && item.source !== 'demo') {
    throw new Error('账本来源必须为 manual、ibkr-flex、ibkr-connector 或 demo。')
  }
  const journal: Journal = {
    version: 1,
    dayZero: item.dayZero === null ? null : date(item.dayZero, 'Day 0'),
    baseCurrency: currency(item.baseCurrency, '基础币种'),
    updatedAt: item.updatedAt === null ? null : timestamp(item.updatedAt, '更新时间'),
    source: item.source,
    trades: list(item.trades, '交易', validateTrade),
    cashflows: list(item.cashflows, '资金流水', validateCashflow),
    snapshots: list(item.snapshots, '账户快照', validateSnapshot),
    ...(item.holdings !== undefined ? { holdings: list(item.holdings, '经纪商持仓', validateHolding) } : {}),
    ...(item.holdingsDate !== undefined ? { holdingsDate: date(item.holdingsDate, '持仓日期') } : {}),
    ...(item.coverage !== undefined ? { coverage: validateCoverage(item.coverage) } : {}),
    ...(item.dailyNotes !== undefined ? { dailyNotes: list(item.dailyNotes, '每日日记', validateDailyNote) } : {}),
  }
  uniqueIds(journal.trades, '交易')
  uniqueIds(journal.cashflows, '资金流水')
  uniqueIds(journal.snapshots, '账户快照')
  const noteDates = new Set<string>()
  for (const note of journal.dailyNotes ?? []) {
    if (noteDates.has(note.date)) throw new Error(`每日日记存在重复日期：${note.date}。每个日期仅保留一篇日记。`)
    noteDates.add(note.date)
  }
  assertBaseCurrency(journal)
  if (journal.dayZero) {
    const beforeStart = journal.trades.some((trade) => tradeDateKey(trade.executedAt) < journal.dayZero!) ||
      [...journal.cashflows, ...journal.snapshots, ...(journal.dailyNotes ?? [])]
        .some((entry) => entry.date < journal.dayZero!)
    if (beforeStart) throw new Error('记录中存在早于 Day 0 的日期，请调整起始日期或记录。')
  }
  return journal
}

export function importJournalJson(text: string): Journal {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSON 文件格式有误，请选择由本网站导出的完整账本。')
  }
  return validateJournal(value)
}

/** Refresh broker state while keeping annotations and truly local additions. */
export function mergePublicWithDraft(published: Journal, draft: Journal): Journal {
  const fresh = validateJournal(published)
  const local = validateJournal(draft)
  const dayZero = fresh.dayZero && local.dayZero
    ? fresh.dayZero > local.dayZero ? fresh.dayZero : local.dayZero
    : fresh.dayZero ?? local.dayZero
  const updatedAt = fresh.updatedAt && local.updatedAt
    ? Date.parse(fresh.updatedAt) > Date.parse(local.updatedAt) ? fresh.updatedAt : local.updatedAt
    : fresh.updatedAt ?? local.updatedAt
  const keepDate = (value: string) => dayZero === null || value >= dayZero
  const clip = (journal: Journal): Journal => ({
    ...journal,
    dayZero,
    updatedAt,
    trades: journal.trades.filter((trade) => keepDate(tradeDateKey(trade.executedAt))),
    cashflows: journal.cashflows.filter((flow) => keepDate(flow.date)),
    snapshots: journal.snapshots.filter((snapshot) => keepDate(snapshot.date)),
    ...(journal.dailyNotes !== undefined ? { dailyNotes: journal.dailyNotes.filter((note) => keepDate(note.date)) } : {}),
  })
  const hasPublicData = fresh.trades.length > 0 || fresh.cashflows.length > 0 ||
    fresh.snapshots.length > 0 || fresh.holdings !== undefined ||
    (fresh.dailyNotes?.length ?? 0) > 0 || fresh.coverage !== undefined
  if (!hasPublicData) return validateJournal(clip(local))
  if (fresh.baseCurrency !== local.baseCurrency) {
    throw new Error('公开账本与本地草稿的基础币种不同，无法合并。请分别导出保存后选择要使用的账本。')
  }
  if ((fresh.source === 'demo') !== (local.source === 'demo')) {
    throw new Error('演示账本与真实账本不能合并，请单独保存演示记录。')
  }
  const isLocalId = (id: string) => !id.toLowerCase().startsWith('ibkr-')
  const localTradeById = new Map(local.trades.map((trade) => [trade.id, trade]))
  const publicTradeIds = new Set(fresh.trades.map((trade) => trade.id))
  const trades = fresh.trades.map((trade) => {
    const annotation = localTradeById.get(trade.id)?.notes
    return annotation !== undefined ? { ...trade, notes: annotation } : { ...trade }
  })
  trades.push(...local.trades.filter((trade) => !publicTradeIds.has(trade.id) && isLocalId(trade.id)))
  trades.sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt))

  const publicCashflowIds = new Set(fresh.cashflows.map((flow) => flow.id))
  const cashflows = [
    ...fresh.cashflows,
    ...local.cashflows.filter((flow) => !publicCashflowIds.has(flow.id) && isLocalId(flow.id)),
  ].sort((a, b) => a.date.localeCompare(b.date))

  // A snapshot date is one broker valuation, not a sum. The latest published
  // value wins even if the local copy has a different ID for the same date.
  const publicSnapshotIds = new Set(fresh.snapshots.map((snapshot) => snapshot.id))
  const publicSnapshotDates = new Set(fresh.snapshots.map((snapshot) => snapshot.date))
  const snapshotByDate = new Map(fresh.snapshots.map((snapshot) => [snapshot.date, snapshot]))
  for (const snapshot of local.snapshots) {
    if (isLocalId(snapshot.id) && !publicSnapshotIds.has(snapshot.id) && !publicSnapshotDates.has(snapshot.date)) {
      snapshotByDate.set(snapshot.date, snapshot)
    }
  }
  const snapshots = [...snapshotByDate.values()].sort((a, b) => a.date.localeCompare(b.date))

  const noteByDate = new Map((fresh.dailyNotes ?? []).map((note) => [note.date, note]))
  for (const note of local.dailyNotes ?? []) {
    const publishedNote = noteByDate.get(note.date)
    if (!publishedNote || Date.parse(note.updatedAt) >= Date.parse(publishedNote.updatedAt)) {
      noteByDate.set(note.date, note)
    }
  }
  // Start from fresh alone so stale local holdings, dates and coverage cannot
  // survive when those fields are replaced or intentionally omitted upstream.
  return validateJournal(clip({
    ...fresh,
    trades,
    cashflows,
    snapshots,
    dailyNotes: [...noteByDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }))
}

/** Missing derivative multipliers must never be inferred from an underlying ticker. */
export function tradeGrossAmount(trade: Trade): number | null {
  if (trade.grossAmount !== undefined) return trade.grossAmount
  return trade.assetClass === undefined || trade.assetClass === 'STK' ? trade.quantity * trade.price : null
}

/** Stock-only moving average book cost; contract identity is unavailable on some feeds. */
function calculatePositions(journal: Journal): { positions: Position[]; realizedPnl: number } {
  assertBaseCurrency(journal)
  const positions = new Map<string, Position>()
  let realizedPnl = 0
  const ordered = journal.trades.map((trade, index) => ({ trade, index }))
    .filter(({ trade }) => trade.assetClass === undefined || trade.assetClass === 'STK')
    .sort((a, b) => Date.parse(a.trade.executedAt) - Date.parse(b.trade.executedAt) || a.index - b.index)
  for (const { trade } of ordered) {
    const unitPrice = tradeGrossAmount(trade)! / trade.quantity
    const key = `${trade.currency}:${trade.symbol}`
    const direction = trade.side === 'BUY' ? 1 : -1
    const current = positions.get(key)
    if (!current || current.quantity === 0) {
      positions.set(key, {
        symbol: trade.symbol,
        quantity: direction * trade.quantity,
        averageCost: unitPrice + direction * trade.fee / trade.quantity,
        currency: trade.currency,
      })
      continue
    }
    if (Math.sign(current.quantity) === direction) {
      const totalQuantity = Math.abs(current.quantity) + trade.quantity
      current.averageCost = (current.averageCost * Math.abs(current.quantity) +
        unitPrice * trade.quantity + direction * trade.fee) / totalQuantity
      current.quantity = direction * totalQuantity
      continue
    }
    const heldQuantity = Math.abs(current.quantity)
    const tolerance = Number.EPSILON * 64 * Math.max(heldQuantity, trade.quantity)
    const closingQuantity = Math.abs(heldQuantity - trade.quantity) <= tolerance
      ? heldQuantity : Math.min(heldQuantity, trade.quantity)
    const closingFee = trade.fee * Math.min(1, closingQuantity / trade.quantity)
    realizedPnl += Math.sign(current.quantity) * (unitPrice - current.averageCost) * closingQuantity - closingFee
    const remainder = trade.quantity - closingQuantity
    if (remainder > tolerance) {
      current.quantity = direction * remainder
      current.averageCost = unitPrice + direction * (trade.fee - closingFee) / remainder
    } else if (heldQuantity - closingQuantity > tolerance) {
      current.quantity = Math.sign(current.quantity) * (heldQuantity - closingQuantity)
    } else {
      positions.delete(key)
    }
  }
  return {
    positions: [...positions.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
    realizedPnl,
  }
}

export function getPositions(journal: Journal): Position[] {
  assertBaseCurrency(journal)
  if (journal.holdings !== undefined) return journal.holdings.map((holding) => ({ ...holding }))
  return calculatePositions(journal).positions
}

export function summarize(journal: Journal): JournalSummary {
  assertBaseCurrency(journal)
  const latest = journal.snapshots.reduce<Snapshot | null>((result, snapshot) =>
    !result || snapshot.date >= result.date ? snapshot : result, null)
  const flows = latest ? journal.cashflows.filter((flow) => flow.date <= latest.date) : journal.cashflows
  const netContributions = flows.reduce((sum, flow) => sum +
    (flow.type === 'DEPOSIT' ? flow.amount : -flow.amount), 0)
  // Day 0 records a zero-funded starting point. A same-day opening deposit is the
  // explicit baseline; an imported mid-history NAV cannot establish total P&L.
  const historyIsComplete = journal.coverage?.complete !== false &&
    (journal.source !== 'ibkr-connector' || journal.coverage?.complete === true)
  const hasFundingBaseline = historyIsComplete && journal.dayZero !== null && flows.some((flow) =>
    flow.date === journal.dayZero && flow.type === 'DEPOSIT')
  const totalPnl = latest && hasFundingBaseline ? latest.netAssetValue - netContributions : null
  const realizedPnlIsComplete = historyIsComplete && journal.trades.every((trade) =>
    trade.assetClass === undefined || trade.assetClass === 'STK')
  return {
    nav: latest?.netAssetValue ?? null,
    cash: latest?.cash ?? null,
    netContributions,
    totalPnl,
    totalReturn: totalPnl !== null && netContributions > 0 ? totalPnl / netContributions : null,
    realizedPnl: realizedPnlIsComplete ? calculatePositions(journal).realizedPnl : null,
    fees: journal.trades.reduce((sum, trade) => sum + trade.fee, 0),
    tradeCount: journal.trades.length,
    valuationDate: latest?.date ?? null,
    hasFundingBaseline,
    realizedPnlIsComplete,
  }
}

interface CsvRow { values: string[]; line: number }

/** RFC 4180-style CSV, including escaped quotes and quoted multi-line notes. */
function parseCsv(text: string): CsvRow[] {
  const source = text.replace(/^\uFEFF/, '')
  const rows: CsvRow[] = []
  let values: string[] = []
  let cell = ''
  let quoted = false
  let afterQuote = false
  let line = 1
  let rowLine = 1
  const pushRow = () => {
    values.push(cell)
    if (values.some((value) => value.trim() !== '')) rows.push({ values, line: rowLine })
    values = []
    cell = ''
    afterQuote = false
    rowLine = line + 1
  }
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1 }
        else { quoted = false; afterQuote = true }
      } else {
        cell += char
        if (char === '\n') line += 1
      }
      continue
    }
    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n' && char !== ' ' && char !== '\t') {
      throw new Error(`CSV 第 ${line} 行：引号后的内容无效。`)
    }
    if (char === '"') {
      if (cell.length > 0 || afterQuote) throw new Error(`CSV 第 ${line} 行：引号位置有误。`)
      quoted = true
    } else if (char === ',') {
      values.push(cell); cell = ''; afterQuote = false
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      pushRow()
      line += 1
    } else if (!afterQuote) {
      cell += char
    }
  }
  if (quoted) throw new Error(`CSV 第 ${rowLine} 行：引号未闭合。`)
  if (cell !== '' || values.length > 0 || afterQuote) pushRow()
  return rows
}

const headerAliases: Record<string, string> = {
  id: 'id', tradeid: 'id', transactionid: 'id',
  executedat: 'executedAt', datetime: 'executedAt', tradedatetime: 'executedAt',
  symbol: 'symbol', ticker: 'symbol',
  side: 'side', buysell: 'side', action: 'side',
  quantity: 'quantity', qty: 'quantity',
  price: 'price', tradeprice: 'price', tprice: 'price',
  fee: 'fee', fees: 'fee', commission: 'fee', ibcommission: 'fee', commfee: 'fee',
  currency: 'currency', currencyprimary: 'currency',
  notes: 'notes', note: 'notes', description: 'notes',
  assetclass: 'assetClass', assetcategory: 'assetClass', sectype: 'assetClass',
  grossamount: 'grossAmount', tradeamount: 'grossAmount', proceeds: 'grossAmount',
  instrumentlabel: 'instrumentLabel', contractdescription: 'instrumentLabel',
  realizedpnl: 'realizedPnl', realizedpl: 'realizedPnl', fifopnlrealized: 'realizedPnl',
  positioneffect: 'positionEffect', opencloseindicator: 'positionEffect',
}

function csvNumber(value: string, label: string, line: number): number {
  const normalized = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    throw new Error(`CSV 第 ${line} 行：${label}必须是数字，千位分隔符请先移除。`)
  }
  const result = Number(normalized)
  if (!Number.isFinite(result)) throw new Error(`CSV 第 ${line} 行：${label}不是有限数字。`)
  return result
}

// Stable IDs make repeated imports idempotent when the caller merges by ID.
function stableCsvId(values: string[]): string {
  const text = JSON.stringify(values)
  let first = 2166136261
  let second = 5381
  for (let index = 0; index < text.length; index += 1) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619)
    second = Math.imul(second, 33) ^ text.charCodeAt(index)
  }
  return `csv-${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`
}

export function importTradesCsv(text: string): Trade[] {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV 需要一行表头和至少一条交易记录。')
  const rawHeaders = rows[0].values.map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
  const headers = rawHeaders.map((value) => headerAliases[value])
  const signedCommission = rawHeaders.some((header) => ['ibcommission', 'commission', 'commfee'].includes(header))
  const signedGrossAmount = rawHeaders.includes('proceeds')
  const mapped = headers.filter(Boolean)
  if (new Set(mapped).size !== mapped.length) throw new Error('CSV 中存在重复的交易字段，请检查表头。')
  for (const required of ['executedAt', 'symbol', 'side', 'quantity', 'price', 'currency']) {
    if (!headers.includes(required)) throw new Error(`CSV 缺少 ${required} 列。请下载示例 CSV 并使用对应表头。`)
  }
  const trades = rows.slice(1).map(({ values, line }) => {
    if (values.length !== headers.length) throw new Error(`CSV 第 ${line} 行：列数与表头不一致。`)
    const item: Record<string, string> = {}
    headers.forEach((header, index) => { if (header) item[header] = header === 'notes' ? values[index] : values[index].trim() })
    const rawSide = item.side.toUpperCase()
    const side = rawSide === 'BOT' || rawSide === 'B' ? 'BUY' : rawSide === 'SLD' || rawSide === 'S' ? 'SELL' : rawSide
    const signedQuantity = csvNumber(item.quantity, '数量', line)
    // IBKR Flex reports costs as negative commissions and rebates as positive;
    // the journal stores costs as positive and rebates as negative.
    if (signedQuantity < 0 && side !== 'SELL') throw new Error(`CSV 第 ${line} 行：买入数量必须大于 0。`)
    const rawFee = item.fee === undefined || item.fee === '' ? 0 : csvNumber(item.fee, '手续费', line)
    const trade = validateTrade({
      id: item.id || 'pending',
      executedAt: item.executedAt,
      symbol: item.symbol,
      side,
      quantity: Math.abs(signedQuantity),
      price: csvNumber(item.price, '成交价', line),
      fee: signedCommission ? -rawFee : rawFee,
      currency: item.currency,
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.assetClass ? { assetClass: item.assetClass.toUpperCase() } : {}),
      ...(item.grossAmount ? { grossAmount: signedGrossAmount
        ? Math.abs(csvNumber(item.grossAmount, '成交总额', line))
        : csvNumber(item.grossAmount, '成交总额', line) } : {}),
      ...(item.instrumentLabel ? { instrumentLabel: item.instrumentLabel } : {}),
      ...(item.realizedPnl ? { realizedPnl: csvNumber(item.realizedPnl, '券商已实现盈亏', line) } : {}),
      ...(item.positionEffect ? { positionEffect: item.positionEffect.toUpperCase() === 'O' ? 'OPEN'
        : item.positionEffect.toUpperCase() === 'C' ? 'CLOSE' : item.positionEffect.toUpperCase() } : {}),
    }, `CSV 第 ${line} 行交易`)
    if (!item.id) trade.id = stableCsvId([
      trade.executedAt, trade.symbol, trade.side, String(trade.quantity), String(trade.price),
      String(trade.fee), trade.currency, trade.notes ?? '', trade.assetClass ?? '',
      trade.grossAmount === undefined ? '' : String(trade.grossAmount), trade.instrumentLabel ?? '',
    ])
    return trade
  })
  uniqueIds(trades, 'CSV 交易')
  return trades
}

export function tradesToCsv(trades: Trade[]): string {
  const encode = (value: string | number) => {
    const text = String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows: (string | number)[][] = [
    ['id', 'executedAt', 'symbol', 'side', 'quantity', 'price', 'fee', 'currency', 'notes',
      'assetClass', 'grossAmount', 'instrumentLabel', 'realizedPnl', 'positionEffect'],
    ...trades.map((trade) => [trade.id, trade.executedAt, trade.symbol, trade.side,
      trade.quantity, trade.price, trade.fee, trade.currency, trade.notes ?? '',
      trade.assetClass ?? '', trade.grossAmount ?? '', trade.instrumentLabel ?? '',
      trade.realizedPnl ?? '', trade.positionEffect ?? '']),
  ]
  return '\uFEFF' + rows.map((row) => row.map(encode).join(',')).join('\r\n') + '\r\n'
}
