import type { Journal, Snapshot, Trade } from './model'

/** Entirely simulated data for the public preview. It is never a brokerage feed. */
export function createDemoJournal(): Journal {
  const dayZero = '2026-08-20'
  const dayAt = (day: number) => new Date(Date.UTC(2026, 7, 20 + day)).toISOString().slice(0, 10)
  const priceAt = (symbol: string, day: number): number => {
    const series: Record<string, [number, number, number]> = {
      NVDA: [176.5, 0.0018, 0.071], AAPL: [238.8, 0.0007, 0.028],
      MSFT: [487.2, 0.0005, 0.036], VOO: [575.4, 0.0009, 0.020], TSLA: [326.8, 0.0012, 0.085],
    }
    const [start, trend, volatility] = series[symbol]
    return Math.round(start * (1 + trend * day + Math.sin(day * 0.29 + start) * volatility +
      Math.sin(day * 0.067 + 2) * volatility * 0.7) * 100) / 100
  }
  const plan: [number, string, 'BUY' | 'SELL', number][] = [
    [0, 'VOO', 'BUY', 35], [1, 'NVDA', 'BUY', 60], [3, 'AAPL', 'BUY', 30],
    [6, 'MSFT', 'BUY', 12], [11, 'NVDA', 'SELL', 15], [14, 'TSLA', 'BUY', 12],
    [18, 'AAPL', 'BUY', 8], [22, 'NVDA', 'BUY', 20], [27, 'VOO', 'BUY', 10],
    [31, 'TSLA', 'SELL', 5], [35, 'MSFT', 'BUY', 6], [40, 'NVDA', 'SELL', 20],
    [45, 'AAPL', 'SELL', 12], [49, 'TSLA', 'BUY', 8], [54, 'VOO', 'BUY', 3],
    [58, 'NVDA', 'BUY', 10], [60, 'AAPL', 'BUY', 4],
  ]
  const trades: Trade[] = plan.map(([day, symbol, side, quantity], index) => ({
    id: `demo-trade-${String(index + 1).padStart(3, '0')}`,
    executedAt: `${dayAt(day)}T14:${String(30 + index).padStart(2, '0')}:00.000Z`,
    symbol, side, quantity, price: priceAt(symbol, day), fee: 1,
    currency: 'USD', notes: '演示交易 · 纯模拟数据',
  }))
  const snapshots: Snapshot[] = []
  const holdings = new Map<string, number>()
  let cash = 0
  for (let day = 0; day <= 60; day += 1) {
    if (day === 0) cash += 50000
    if (day === 25) cash += 10000
    for (const trade of trades.filter((entry) => entry.executedAt.startsWith(dayAt(day)))) {
      const direction = trade.side === 'BUY' ? 1 : -1
      holdings.set(trade.symbol, (holdings.get(trade.symbol) ?? 0) + direction * trade.quantity)
      cash -= direction * trade.quantity * trade.price + trade.fee
    }
    const positionsValue = [...holdings].reduce((sum, [symbol, quantity]) => sum + quantity * priceAt(symbol, day), 0)
    snapshots.push({
      id: `demo-snapshot-${dayAt(day)}`, date: dayAt(day),
      netAssetValue: Math.round((cash + positionsValue) * 100) / 100,
      cash: Math.round(cash * 100) / 100, currency: 'USD',
    })
  }
  return {
    version: 1, dayZero, baseCurrency: 'USD', updatedAt: '2026-10-19T15:00:00.000Z', source: 'demo',
    trades,
    cashflows: [
      { id: 'demo-deposit-1', date: dayZero, type: 'DEPOSIT', amount: 50000, currency: 'USD', notes: '模拟初始资金' },
      { id: 'demo-deposit-2', date: dayAt(25), type: 'DEPOSIT', amount: 10000, currency: 'USD', notes: '模拟追加入金' },
    ],
    snapshots,
  }
}

export const demoJournal = createDemoJournal()
