<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from 'vue';
import Icon from './Icon.vue';
import DailyDiary from './DailyDiary.vue';
import ProfitReview from './ProfitReview.vue';
import {
  createEmptyJournal,
  validateJournal,
  mergePublicWithDraft,
  summarize,
  getPositions,
  importTradesCsv,
  tradesToCsv,
  tradeDateKey,
  tradeGrossAmount,
  type Journal,
} from './model';
import {demoJournal} from './demo';

type Page =
  | 'diary'
  | 'pnl'
  | 'overview'
  | 'journal'
  | 'positions'
  | 'timeline'
  | 'settings';
const pages: {id: Page; label: string; en: string}[] = [
  {id: 'diary', label: '交易日记', en: 'Daily journal'},
  {id: 'pnl', label: '逐笔盈亏', en: 'Trade P&L'},
  {id: 'overview', label: '账户总览', en: 'Overview'},
  {id: 'journal', label: '交易账本', en: 'Trade journal'},
  {id: 'positions', label: '持仓', en: 'Positions'},
  {id: 'timeline', label: '时间轴', en: 'Timeline'},
];
const page = ref<Page>('diary');
const mobileNav = ref(false);
const publicJournal = ref<Journal>(createEmptyJournal());
const localJournal = ref<Journal | null>(null);
const demo = ref(true);
const loading = ref(true);
const notice = ref('');
const sourceError = ref('');
const storageKey = 'zhiyu-day-zero-journal-v1';
const current = computed<Journal>(() =>
  demo.value ? demoJournal : (localJournal.value ?? publicJournal.value),
);
const summary = computed(() => summarize(current.value));
const positions = computed(() => getPositions(current.value));
const title = computed(() =>
  page.value === 'settings'
    ? '数据与连接'
    : pages.find((p) => p.id === page.value)?.label,
);
const activeTitle = computed(() =>
  page.value === 'settings'
    ? 'Data & connection'
    : pages.find((p) => p.id === page.value)?.en,
);
const dateToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
}).format(new Date());
const diaryDate = ref(dateToday);
function openDiary(date: string) {
  diaryDate.value = date;
  switchPage('diary');
}
const tradePnlKnown = (trade: Journal['trades'][number]) =>
  trade.realizedPnl !== undefined &&
  (trade.realizedPnl !== 0 ||
    trade.positionEffect === 'CLOSE' ||
    (trade.side === 'SELL' && trade.positionEffect !== 'OPEN'));
const dayCount = computed(() =>
  current.value.dayZero
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(dateToday) - Date.parse(current.value.dayZero)) /
            86400000,
        ),
      )
    : 0,
);
const range = ref('ALL');
const snapshots = computed(() =>
  [...current.value.snapshots].sort((a, b) => a.date.localeCompare(b.date)),
);
const visibleSnapshots = computed(() => {
  const data = snapshots.value;
  if (range.value === 'ALL' || !data.length) return data;
  const last = Date.parse(data[data.length - 1]!.date);
  const days = range.value === '1M' ? 30 : 90;
  return data.filter((s) => Date.parse(s.date) >= last - days * 86400000);
});
const chartBounds = computed(() => {
  const values = visibleSnapshots.value.map((s) => s.netAssetValue);
  const min = Math.min(...values, 0),
    max = Math.max(...values, 1);
  const actualMin = values.length ? Math.min(...values) : min;
  const spread = Math.max(max - actualMin, max * 0.05, 1);
  return {min: actualMin - spread * 0.22, max: max + spread * 0.16};
});
const chartPoints = computed(() =>
  visibleSnapshots.value.map((s, i, arr) => ({
    x: 52 + (arr.length > 1 ? i / (arr.length - 1) : 0.5) * 908,
    y:
      226 -
      ((s.netAssetValue - chartBounds.value.min) /
        (chartBounds.value.max - chartBounds.value.min)) *
        198,
    value: s.netAssetValue,
    date: s.date,
  })),
);
const linePath = computed(() =>
  chartPoints.value
    .map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' '),
);
const areaPath = computed(() =>
  chartPoints.value.length
    ? `${linePath.value} L ${chartPoints.value.at(-1)!.x} 248 L ${chartPoints.value[0]!.x} 248 Z`
    : '',
);
const hoverPoint = ref<number | null>(null);
const highlighted = computed(() =>
  hoverPoint.value === null ? null : chartPoints.value[hoverPoint.value],
);
function chartHover(event: MouseEvent) {
  if (!chartPoints.value.length) return;
  const bounds = (event.currentTarget as SVGElement).getBoundingClientRect();
  hoverPoint.value = Math.min(
    chartPoints.value.length - 1,
    Math.max(
      0,
      Math.round(
        ((((event.clientX - bounds.left) / bounds.width) * 1000 - 52) / 908) *
          (chartPoints.value.length - 1),
      ),
    ),
  );
}
const latestSnapshot = computed(() => snapshots.value.at(-1));
const chartTicks = computed(() =>
  [0, 1, 2, 3].map(
    (i) =>
      chartBounds.value.max -
      ((chartBounds.value.max - chartBounds.value.min) * i) / 3,
  ),
);
const query = ref('');
const side = ref('ALL');
const fromDate = ref('');
const toDate = ref('');
const sortedTrades = computed(() =>
  [...current.value.trades].sort(
    (a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt),
  ),
);
const filteredTrades = computed(() =>
  sortedTrades.value.filter(
    (t) =>
      (side.value === 'ALL' || side.value === t.side) &&
      (!query.value ||
        `${t.symbol} ${t.notes || ''}`
          .toLowerCase()
          .includes(query.value.toLowerCase())) &&
      (!fromDate.value || tradeDateKey(t.executedAt) >= fromDate.value) &&
      (!toDate.value || tradeDateKey(t.executedAt) <= toDate.value),
  ),
);
const shownTrades = computed(() =>
  page.value === 'overview'
    ? sortedTrades.value.slice(0, 5)
    : filteredTrades.value,
);
const journalLimit = ref(30);
const pagedTrades = computed(() =>
  page.value === 'overview'
    ? shownTrades.value
    : shownTrades.value.slice(0, journalLimit.value),
);
const timeline = computed(() =>
  [
    ...current.value.cashflows.map((c) => ({
      id: c.id,
      date: c.date,
      kind: c.type === 'DEPOSIT' ? '资金转入' : '资金转出',
      description: c.notes || '现金流水',
      amount: (c.type === 'DEPOSIT' ? 1 : -1) * c.amount,
      icon: 'wallet',
    })),
    ...current.value.snapshots.map((s) => ({
      id: s.id,
      date: s.date,
      kind: '账户快照',
      description: '账户净值 / Net asset value',
      amount: s.netAssetValue,
      icon: 'positions',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)),
);
const authoritativeHoldings = computed(
  () => current.value.holdings !== undefined,
);
const positionValue = (p: ReturnType<typeof getPositions>[number]) =>
  p.marketValue ?? p.quantity * p.averageCost;
const investedCost = computed(() =>
  positions.value.reduce((sum, p) => sum + Math.abs(positionValue(p)), 0),
);
const allocationColors = [
  '#b8f878',
  '#8ebbf0',
  '#b3a4e9',
  '#e4b77b',
  '#7bc7ba',
];
const topPositions = computed(() =>
  [...positions.value].sort(
    (a, b) => Math.abs(positionValue(b)) - Math.abs(positionValue(a)),
  ),
);
const allocationGradient = computed(() => {
  let start = 0;
  const segments = topPositions.value.map((p, i) => {
    const end =
      start +
      (Math.abs(positionValue(p)) / Math.max(investedCost.value, 1)) * 100;
    const segment = `${allocationColors[i % 5]} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  return segments.length
    ? `conic-gradient(${segments.join(',')})`
    : 'conic-gradient(#29312b 0% 100%)';
});
function money(value: number | null | undefined, digits = 2) {
  return value === null || value === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: current.value.baseCurrency,
        maximumFractionDigits: digits,
      }).format(value);
}
function number(value: number, digits = 2) {
  return new Intl.NumberFormat('en-US', {maximumFractionDigits: digits}).format(
    value,
  );
}
function percent(value: number | null) {
  return value === null
    ? '—'
    : `${value >= 0 ? '+' : ''}${number(value * 100)}%`;
}
function shortDate(value: string) {
  return value.slice(5, 10).replace('-', '.');
}
function tradeDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
function switchPage(id: Page) {
  page.value = id;
  mobileNav.value = false;
  window.scrollTo({top: 0, behavior: 'instant'});
}
function showNotice(message: string) {
  notice.value = message;
}
function save(journal: Journal) {
  const validated = validateJournal(journal);
  try {
    localStorage.setItem(storageKey, JSON.stringify(validated));
  } catch {
    throw new Error('浏览器未能保存数据，请导出备份后重试。');
  }
  localJournal.value = validated;
  demo.value = false;
}
function download(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function exportJson() {
  download(
    JSON.stringify(current.value, null, 2),
    `day-zero-${demo.value ? 'demo' : dateToday}.json`,
    'application/json',
  );
  showNotice('账本已导出。');
}
function exportCsv() {
  download(
    tradesToCsv(current.value.trades),
    `day-zero-trades-${dateToday}.csv`,
    'text/csv;charset=utf-8',
  );
}
const fileInput = ref<HTMLInputElement | null>(null);
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024)
      throw new Error('请导入 10 MB 以内的文件。');
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      const imported = validateJournal(JSON.parse(text));
      save(imported);
      showNotice(`已在本机载入账本：${imported.trades.length} 笔交易。`);
    } else {
      const incoming = importTradesCsv(text);
      const base = localJournal.value ?? publicJournal.value;
      const map = new Map(base.trades.map((t) => [t.id, t]));
      incoming.forEach((t) => map.set(t.id, t));
      const dates = [...map.values()]
        .map((t) => tradeDateKey(t.executedAt))
        .sort();
      save({
        ...base,
        source: 'manual',
        updatedAt: new Date().toISOString(),
        dayZero: base.dayZero ?? dates[0] ?? null,
        trades: [...map.values()],
      });
      showNotice(`已导入 ${incoming.length} 笔交易，相同 ID 自动合并。`);
    }
  } catch (error) {
    showNotice(error instanceof Error ? error.message : '文件格式无法识别。');
  }
  input.value = '';
}
function downloadTemplate() {
  download(
    'id,executedAt,symbol,side,quantity,price,fee,currency,notes\ntrade-001,2026-10-19T14:30:00-04:00,AAPL,BUY,1,200,0.35,USD,交易理由\n',
    'day-zero-template.csv',
    'text/csv;charset=utf-8',
  );
}
const modal = ref<HTMLDialogElement | null>(null);
const recordKind = ref<'trade' | 'snapshot' | 'cashflow'>('trade');
const recordError = ref('');
const draft = ref({
  date: dateToday,
  time: '09:30',
  symbol: '',
  side: 'BUY' as 'BUY' | 'SELL',
  quantity: '',
  price: '',
  fee: '0',
  notes: '',
  nav: '',
  cash: '',
  amount: '',
  flowType: 'DEPOSIT' as 'DEPOSIT' | 'WITHDRAWAL',
});
async function openRecord(kind: 'trade' | 'snapshot' | 'cashflow' = 'trade') {
  recordKind.value = kind;
  recordError.value = '';
  await nextTick();
  modal.value?.showModal();
}
function openDiaryRecord(date: string) {
  draft.value.date = date;
  openRecord();
}
function addRecord() {
  try {
    const base = structuredClone(
      localJournal.value
        ? JSON.parse(JSON.stringify(localJournal.value))
        : JSON.parse(JSON.stringify(publicJournal.value)),
    ) as Journal;
    base.source = 'manual';
    base.updatedAt = new Date().toISOString();
    if (base.dayZero && draft.value.date < base.dayZero)
      throw new Error(`记录日期不能早于 Day 0（${base.dayZero}）。`);
    base.dayZero = base.dayZero ?? draft.value.date;
    const id = crypto.randomUUID();
    if (recordKind.value === 'trade') {
      if (
        !draft.value.symbol.trim() ||
        !draft.value.quantity ||
        !draft.value.price
      )
        throw new Error('请填写交易代码、数量和成交价。');
      // Manual entry time is explicitly Beijing time, independent of the browser's timezone.
      base.trades.push({
        id,
        executedAt: new Date(
          `${draft.value.date}T${draft.value.time}:00+08:00`,
        ).toISOString(),
        symbol: draft.value.symbol.trim().toUpperCase(),
        side: draft.value.side,
        quantity: Number(draft.value.quantity),
        price: Number(draft.value.price),
        fee: Number(draft.value.fee),
        currency: base.baseCurrency,
        notes: draft.value.notes.trim(),
      });
    } else if (recordKind.value === 'snapshot') {
      if (!draft.value.nav || !draft.value.cash)
        throw new Error('请填写账户净值和现金余额（可填写 0）。');
      const snapshot = {
        id,
        date: draft.value.date,
        netAssetValue: Number(draft.value.nav),
        cash: Number(draft.value.cash),
        currency: base.baseCurrency,
      };
      base.snapshots = base.snapshots.filter((s) => s.date !== snapshot.date);
      base.snapshots.push(snapshot);
    } else {
      if (!draft.value.amount) throw new Error('请填写入出金金额。');
      base.cashflows.push({
        id,
        date: draft.value.date,
        type: draft.value.flowType,
        amount: Number(draft.value.amount),
        currency: base.baseCurrency,
        notes: draft.value.notes.trim(),
      });
    }
    save(base);
    modal.value?.close();
    showNotice('已保存到本机账本。可在「数据与连接」导出备份。');
    draft.value = {
      ...draft.value,
      symbol: '',
      quantity: '',
      price: '',
      fee: '0',
      notes: '',
      amount: '',
      nav: '',
      cash: '',
    };
  } catch (error) {
    recordError.value =
      error instanceof Error ? error.message : '无法保存记录。';
  }
}
const setupDay = ref(dateToday);
function setDayZero() {
  try {
    save({
      ...(localJournal.value ?? publicJournal.value),
      dayZero: setupDay.value,
      updatedAt: new Date().toISOString(),
    });
    showNotice('Day 0 已更新。');
  } catch (e) {
    showNotice(e instanceof Error ? e.message : '无法保存');
  }
}
function showReal() {
  demo.value = false;
}
function saveDiary(date: string, text: string) {
  try {
    if (demo.value) return;
    const base = localJournal.value ?? publicJournal.value;
    const entry = {date, text, updatedAt: new Date().toISOString()};
    save({
      ...base,
      dailyNotes: [
        ...(base.dailyNotes ?? []).filter((n) => n.date !== date),
        entry,
      ],
    });
    showNotice('当日日记已保存到本机。可导出完整账本备份。');
  } catch (e) {
    showNotice(e instanceof Error ? e.message : '日记无法保存。');
  }
}
function saveTradeNote(id: string, text: string) {
  try {
    if (demo.value) return;
    const base = localJournal.value ?? publicJournal.value;
    save({
      ...base,
      trades: base.trades.map((t) => (t.id === id ? {...t, notes: text} : t)),
    });
    showNotice('交易笔记已保存到本机。');
  } catch (e) {
    showNotice(e instanceof Error ? e.message : '笔记无法保存。');
  }
}
const sparkPath = computed(() => {
  const values = visibleSnapshots.value.map((s) => s.netAssetValue);
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const span = Math.max(hi - lo, 1);
  return values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'} ${(i / Math.max(values.length - 1, 1)) * 118 + 1} ${28 - ((v - lo) / span) * 26}`,
    )
    .join(' ');
});
const resetDialog = ref<HTMLDialogElement | null>(null);
function resetLocal() {
  try {
    localStorage.removeItem(storageKey);
    localJournal.value = null;
    demo.value = false;
    resetDialog.value?.close();
    showNotice('已恢复公开账本，本机草稿已清除。');
  } catch {
    showNotice('浏览器无法清除本机草稿。');
  }
}
const showSetup = ref(false);
onMounted(async () => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) localJournal.value = validateJournal(JSON.parse(stored));
  } catch {
    showNotice('本机账本无法读取，请从备份恢复。');
  }
  try {
    const response = await fetch('/trading-data.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('公开数据暂时无法读取');
    publicJournal.value = validateJournal(await response.json());
    if (localJournal.value) {
      try {
        const refreshed = mergePublicWithDraft(
          publicJournal.value,
          localJournal.value,
        );
        localJournal.value = refreshed;
        localStorage.setItem(storageKey, JSON.stringify(refreshed));
      } catch {
        showNotice('本机草稿与公开账本不能合并，请导出备份后核对。');
      }
    }
  } catch {
    sourceError.value =
      '公开账本暂时无法读取，可以继续查看演示或使用本机账本。';
  }
  const hasData = !!(
    localJournal.value ||
    publicJournal.value.trades.length ||
    publicJournal.value.snapshots.length ||
    publicJournal.value.cashflows.length ||
    publicJournal.value.dayZero
  );
  demo.value = !hasData;
  setupDay.value =
    localJournal.value?.dayZero ?? publicJournal.value.dayZero ?? dateToday;
  loading.value = false;
});
</script>

<template>
  <div class="trading-shell">
    <a class="skip" href="#main">跳到主要内容</a>
    <aside class="sidebar" :class="{expanded: mobileNav}">
      <a href="/" class="brand" aria-label="返回 Zhiyu Liu 个人网站"
        ><span class="brand-mark">ZL<span>.</span></span
        ><span class="brand-caption">PERSONAL SPACE</span></a
      >
      <div class="workspace-tag">
        <span class="tiny-orbit">✳</span
        ><span>Day Zero<small>THE TRADING JOURNAL</small></span
        ><span class="version">01</span>
      </div>
      <p class="nav-label">WORKSPACE</p>
      <nav aria-label="交易日志导航">
        <button
          v-for="item in pages"
          :key="item.id"
          :class="{selected: page === item.id}"
          @click="switchPage(item.id)"
        >
          <Icon :name="item.id" /><span>{{ item.label }}</span
          ><span v-if="item.id === 'journal'" class="nav-count">{{
            current.trades.length
          }}</span
          ><i v-if="page === item.id" />
        </button>
      </nav>
      <div class="sidebar-story">
        <div class="story-line" />
        <p>Small decisions.<br /><span>Long horizons.</span></p>
        <small>记录决策，见证复利。</small>
      </div>
      <div class="sidebar-bottom">
        <button class="connection-button" @click="switchPage('settings')">
          <span
            class="connection-dot"
            :class="{
              connected:
                publicJournal.source.startsWith('ibkr') &&
                !!publicJournal.updatedAt,
            }"
          /><span
            >Interactive Brokers<small>{{
              publicJournal.source === 'ibkr-connector'
                ? '已载入账户快照'
                : publicJournal.source === 'ibkr-flex'
                  ? 'Flex 报表已导入'
                  : '等待连接账户'
            }}</small></span
          ><Icon name="chevron" :size="14" /></button
        ><button
          class="settings-button"
          :class="{selected: page === 'settings'}"
          @click="switchPage('settings')"
        >
          <Icon name="settings" />数据与连接<Icon
            name="up"
            :size="14"
          /></button
        ><a class="back-home" href="/">← zhiyuliu.com</a>
      </div>
    </aside>
    <div v-if="mobileNav" class="nav-backdrop" @click="mobileNav = false" />
    <div class="main-shell">
      <header class="topbar">
        <div class="breadcrumb">
          <button
            class="mobile-menu icon-button"
            @click="mobileNav = !mobileNav"
            aria-label="打开导航"
          >
            <Icon name="menu" /></button
          ><span>Personal space</span><span class="slash">/</span
          ><strong>{{ activeTitle }}</strong>
        </div>
        <div class="topbar-right">
          <span class="public-label"
            ><Icon name="globe" :size="13" />公开交易日志</span
          ><span class="avatar">ZL</span>
        </div>
      </header>
      <main id="main" class="main-content">
        <div v-if="sourceError" class="data-warning" role="status">
          <Icon name="info" />{{ sourceError }}
        </div>
        <div class="mode-banner" :class="{live: !demo}">
          <div>
            <span class="status-dot" /><strong>{{
              demo ? '演示模式' : localJournal ? '本机账本' : '公开账本'
            }}</strong
            ><span>{{
              demo
                ? '以下交易与金额均为模拟数据，用于预览页面。'
                : localJournal
                  ? '记录已保存在当前浏览器；导出可备份。'
                  : publicJournal.updatedAt
                    ? '展示已发布的账户记录。'
                    : '从第一笔交易开始，建立你的真实记录。'
            }}</span>
          </div>
          <button @click="demo ? showReal() : (demo = true)">
            {{ demo ? '进入我的账本' : '查看演示' }}
            <Icon name="arrow" :size="14" />
          </button>
        </div>
        <DailyDiary
          v-if="page === 'diary'"
          :journal="current"
          :initial-date="diaryDate"
          :demo="demo"
          @save-diary="saveDiary"
          @save-trade-note="saveTradeNote"
          @record="openDiaryRecord"
        />
        <template v-if="page === 'overview'">
          <div v-if="!demo && current.coverage" class="coverage-note">
            <Icon name="info" :size="14" /><span>{{
              `自 ${current.dayZero} 起公开 · IBKR 账户快照 · 历史完整性待报表补全`
            }}</span>
          </div>
          <section class="hero-section">
            <div class="hero-text">
              <p class="eyebrow">
                <span />A PERSONAL EXPERIMENT IN COMPOUNDING
              </p>
              <h1>Every trade.<br /><span>A longer story.</span></h1>
              <p class="hero-description">
                从 Day 0 开始，记录每一次判断。<br />让时间，成为交易的一部分。
              </p>
              <div class="hero-actions">
                <button class="primary-button" @click="openRecord()">
                  <Icon name="plus" :size="16" />记录交易</button
                ><button class="quiet-button" @click="switchPage('journal')">
                  查看交易账本 <Icon name="arrow" :size="16" />
                </button>
              </div>
            </div>
            <div class="day-art">
              <svg viewBox="0 0 350 280" class="orbital-art" aria-hidden="true">
                <defs>
                  <radialGradient id="orbGlow">
                    <stop stop-color="#b8f878" stop-opacity=".11" />
                    <stop offset="1" stop-color="#b8f878" stop-opacity="0" />
                  </radialGradient>
                </defs>
                <circle cx="175" cy="140" r="138" fill="url(#orbGlow)" />
                <g fill="none" stroke="#b8f878" stroke-opacity=".15">
                  <ellipse
                    cx="175"
                    cy="140"
                    rx="127"
                    ry="100"
                    transform="rotate(-25 175 140)"
                  />
                  <ellipse
                    cx="175"
                    cy="140"
                    rx="127"
                    ry="47"
                    transform="rotate(-25 175 140)"
                  />
                  <ellipse
                    cx="175"
                    cy="140"
                    rx="53"
                    ry="100"
                    transform="rotate(-25 175 140)"
                  />
                  <path d="M30 140h290M175 14v252" stroke-dasharray="3 6" />
                </g>
                <circle cx="284" cy="67" r="4" fill="#b8f878" />
                <circle
                  cx="284"
                  cy="67"
                  r="9"
                  fill="none"
                  stroke="#b8f878"
                  stroke-opacity=".3"
                />
              </svg>
              <div class="day-readout">
                <span class="small-label">THE JOURNEY SO FAR</span>
                <div>
                  <small>DAY</small
                  ><strong>{{ String(dayCount).padStart(3, '0') }}</strong
                  ><span class="blinking-block" />
                </div>
                <p>
                  {{
                    current.dayZero
                      ? `始于 ${current.dayZero.replaceAll('-', '.')}`
                      : '你的 Day 0，由你定义。'
                  }}
                </p>
              </div>
              <span class="art-coordinate">{{
                demo ? 'SIMULATION / 001' : 'JOURNAL / 001'
              }}</span>
            </div>
          </section>
          <section class="metrics-grid" aria-label="账户摘要">
            <article class="metric-card primary-metric">
              <div class="metric-label">
                账户净值 <Icon name="wallet" :size="16" />
              </div>
              <p>
                {{ money(summary.nav) }}<span>{{ current.baseCurrency }}</span>
              </p>
              <small>{{
                latestSnapshot
                  ? `截至 ${latestSnapshot.date}`
                  : '等待第一份账户快照'
              }}</small
              ><svg
                class="metric-spark"
                viewBox="0 0 120 30"
                aria-hidden="true"
              >
                <path
                  :d="sparkPath"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
            </article>
            <article class="metric-card">
              <div class="metric-label">
                累计收益 <Icon name="positions" :size="16" />
              </div>
              <p
                :class="{
                  positive: (summary.totalPnl ?? 0) > 0,
                  negative: (summary.totalPnl ?? 0) < 0,
                }"
              >
                {{ summary.totalPnl !== null && summary.totalPnl > 0 ? '+' : ''
                }}{{ money(summary.totalPnl) }}
              </p>
              <small v-if="summary.totalPnl !== null"
                ><b
                  :class="
                    (summary.totalReturn ?? 0) >= 0 ? 'positive' : 'negative'
                  "
                  >{{ percent(summary.totalReturn) }}</b
                >
                <span>相对净入金 · 非年化</span></small
              ><small v-else>缺少完整入出金，暂不计算</small>
            </article>
            <article class="metric-card">
              <div class="metric-label">
                现金余额 <Icon name="layers" :size="16" />
              </div>
              <p>{{ money(summary.cash) }}</p>
              <small>{{
                summary.nav && summary.cash !== null
                  ? `${number((summary.cash / summary.nav) * 100, 1)}% 的账户净值`
                  : '以账户快照为准'
              }}</small>
            </article>
            <article class="metric-card">
              <div class="metric-label">
                交易笔数 <Icon name="journal" :size="16" />
              </div>
              <p>
                {{ String(summary.tradeCount).padStart(2, '0')
                }}<span>TRADES</span>
              </p>
              <small
                ><span class="subtle-dot" />{{
                  current.trades.filter((t) => t.side === 'BUY').length
                }}
                买入 <span class="metric-divider">/</span
                >{{
                  current.trades.filter((t) => t.side === 'SELL').length
                }}
                卖出</small
              >
            </article>
          </section>
          <div class="analytics-grid">
            <section class="panel equity-panel">
              <div class="panel-heading">
                <div>
                  <h2>账户轨迹 <small>Equity curve</small></h2>
                  <p>
                    {{
                      highlighted
                        ? `${highlighted.date} · ${money(highlighted.value)}`
                        : '每一个数据点，都是一个账户快照。'
                    }}
                  </p>
                </div>
                <div class="range-tabs" role="group" aria-label="曲线时间范围">
                  <button
                    v-for="r in ['1M', '3M', 'ALL']"
                    :key="r"
                    :aria-pressed="range === r"
                    :class="{active: range === r}"
                    @click="range = r"
                  >
                    {{ r }}
                  </button>
                </div>
              </div>
              <div v-if="chartPoints.length" class="equity-chart">
                <svg
                  viewBox="0 0 1000 275"
                  role="img"
                  aria-label="账户净值历史曲线，数据按快照日期展示"
                  @mousemove="chartHover"
                  @mouseleave="hoverPoint = null"
                >
                  <defs>
                    <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                      <stop stop-color="#b8f878" stop-opacity=".17" />
                      <stop offset="1" stop-color="#b8f878" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <g v-for="(tick, i) in chartTicks" :key="i">
                    <line
                      x1="52"
                      x2="960"
                      :y1="28 + i * 66"
                      :y2="28 + i * 66"
                      stroke="#ffffff"
                      stroke-opacity=".065"
                      stroke-dasharray="3 5"
                    />
                    <text x="0" :y="32 + i * 66" class="chart-label">
                      {{
                        Math.abs(tick) >= 1000
                          ? `${number(tick / 1000, 1)}k`
                          : number(tick, 0)
                      }}
                    </text>
                  </g>
                  <path :d="areaPath" fill="url(#equityFill)" />
                  <path
                    :d="linePath"
                    fill="none"
                    stroke="#b8f878"
                    stroke-width="2.4"
                    stroke-linejoin="round"
                  />
                  <circle
                    v-if="chartPoints.at(-1)"
                    :cx="chartPoints.at(-1)!.x"
                    :cy="chartPoints.at(-1)!.y"
                    r="4"
                    fill="#b8f878"
                  />
                  <g v-if="highlighted">
                    <line
                      :x1="highlighted.x"
                      :x2="highlighted.x"
                      y1="10"
                      y2="248"
                      stroke="#b8f878"
                      stroke-dasharray="3 4"
                      stroke-opacity=".5"
                    />
                    <circle
                      :cx="highlighted.x"
                      :cy="highlighted.y"
                      r="5"
                      fill="#b8f878"
                      stroke="#101511"
                      stroke-width="2"
                    />
                  </g>
                  <text
                    v-for="index in [
                      ...new Set([
                        0,
                        Math.floor((chartPoints.length - 1) / 3),
                        Math.floor(((chartPoints.length - 1) * 2) / 3),
                        chartPoints.length - 1,
                      ]),
                    ]"
                    :key="index"
                    :x="chartPoints[index]?.x"
                    y="270"
                    text-anchor="middle"
                    class="chart-label"
                  >
                    {{ shortDate(chartPoints[index]!.date) }}
                  </text>
                </svg>
              </div>
              <div v-else class="chart-empty">
                <Icon name="positions" :size="32" />
                <h3>第一条轨迹，始于今天。</h3>
                <p>添加账户快照，净值曲线就会从这里生长。</p>
                <button class="text-button" @click="openRecord('snapshot')">
                  添加账户快照 ↗
                </button>
              </div>
              <div class="chart-foot">
                <span><i />账户净值</span
                ><span>{{
                  demo
                    ? 'SIMULATED DATA'
                    : `ACCOUNT SNAPSHOTS · ${current.baseCurrency}`
                }}</span
                ><span>{{ visibleSnapshots.length }} 个数据点</span>
              </div>
            </section>
            <section class="panel allocation-panel">
              <div class="panel-heading">
                <div>
                  <h2>持仓分布 <small>Allocation</small></h2>
                  <p>
                    {{
                      authoritativeHoldings
                        ? '按最新持仓市值'
                        : '按剩余持仓成本'
                    }}
                  </p>
                </div>
                <Icon name="layers" :size="18" />
              </div>
              <div class="donut" :style="{background: allocationGradient}">
                <div>
                  <span>{{ positions.length.toString().padStart(2, '0') }}</span
                  ><small>POSITIONS</small>
                </div>
              </div>
              <div class="allocation-legend">
                <div
                  v-for="(p, i) in topPositions.slice(0, 4)"
                  :key="p.instrumentLabel || p.symbol"
                >
                  <span
                    ><i :style="{background: allocationColors[i % 5]}" />{{
                      p.symbol
                    }}</span
                  ><strong
                    >{{
                      number(
                        (Math.abs(positionValue(p)) /
                          Math.max(investedCost, 1)) *
                          100,
                        1,
                      )
                    }}<small>%</small></strong
                  >
                </div>
                <p v-if="!positions.length" class="muted">
                  记录买入后显示持仓分布。
                </p>
                <div v-if="topPositions.length > 4">
                  <span
                    ><i
                      :style="{background: allocationColors[4]}"
                    />其他持仓</span
                  ><strong
                    >{{
                      number(
                        (topPositions
                          .slice(4)
                          .reduce((s, p) => s + Math.abs(positionValue(p)), 0) /
                          Math.max(investedCost, 1)) *
                          100,
                        1,
                      )
                    }}<small>%</small></strong
                  >
                </div>
              </div>
              <button class="allocation-link" @click="switchPage('positions')">
                查看全部持仓 <Icon name="arrow" :size="15" />
              </button>
            </section>
          </div>
        </template>
        <template v-else-if="page !== 'diary'">
          <div class="page-heading">
            <div>
              <p class="eyebrow"><span />{{ activeTitle?.toUpperCase() }}</p>
              <h1>{{ title }}<span>.</span></h1>
              <p>
                {{
                  page === 'pnl'
                    ? '每一笔赚了多少，亏了多少，清清楚楚。'
                    : page === 'journal'
                      ? '每一笔成交，都有迹可循。'
                      : page === 'positions'
                        ? '观察配置，也观察自己的判断。'
                        : page === 'timeline'
                          ? '从最初的投入，到每一次新的刻度。'
                          : '连接账户，让记录持续发生。'
                }}
              </p>
            </div>
            <button
              v-if="page === 'journal'"
              class="primary-button"
              @click="openRecord()"
            >
              <Icon name="plus" :size="16" />记录交易</button
            ><button
              v-if="page === 'timeline'"
              class="primary-button"
              @click="openRecord('snapshot')"
            >
              <Icon name="plus" :size="16" />记录账户快照
            </button>
          </div>
        </template>
        <ProfitReview
          v-if="page === 'pnl'"
          :journal="current"
          @open-diary="openDiary"
        />
        <section
          v-if="page === 'overview' || page === 'journal'"
          class="panel trades-panel"
        >
          <div class="panel-heading">
            <div>
              <h2>
                {{ page === 'overview' ? '最近交易' : '全部交易' }}
                <small>{{
                  page === 'overview'
                    ? 'Recent activity'
                    : `${filteredTrades.length} records`
                }}</small>
              </h2>
              <p v-if="page === 'overview'">记录行动，也留住当时的思考。</p>
            </div>
            <button
              v-if="page === 'overview'"
              class="text-button"
              @click="switchPage('journal')"
            >
              查看全部 <Icon name="arrow" :size="15" /></button
            ><button v-else class="quiet-button" @click="exportCsv">
              <Icon name="download" :size="15" />导出 CSV
            </button>
          </div>
          <div v-if="page === 'journal'" class="table-toolbar">
            <label class="search-field"
              ><Icon name="search" :size="16" /><input
                v-model="query"
                aria-label="搜索交易代码或笔记"
                placeholder="搜索代码、交易笔记…"
            /></label>
            <div class="filter-tabs" role="group" aria-label="交易方向">
              <button
                v-for="s in [
                  {v: 'ALL', t: '全部'},
                  {v: 'BUY', t: '买入'},
                  {v: 'SELL', t: '卖出'},
                ]"
                :key="s.v"
                :class="{active: side === s.v}"
                :aria-pressed="side === s.v"
                @click="side = s.v"
              >
                {{ s.t }}
              </button>
            </div>
            <label class="date-filter"
              >从<input
                type="date"
                v-model="fromDate"
                aria-label="开始日期" /></label
            ><label class="date-filter"
              >至<input type="date" v-model="toDate" aria-label="结束日期"
            /></label>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>交易标的</th>
                  <th>方向</th>
                  <th class="numeric">成交价</th>
                  <th class="numeric">数量</th>
                  <th class="numeric">成交金额</th>
                  <th class="numeric">手续费</th>
                  <th class="numeric">逐笔盈亏</th>
                  <th class="date-column">成交时间 <span>UTC+8</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(trade, index) in pagedTrades" :key="trade.id">
                  <td>
                    <div class="symbol-cell">
                      <span
                        class="ticker-avatar"
                        :style="{'--ticker-color': allocationColors[index % 5]}"
                        >{{ trade.symbol.slice(0, 1) }}</span
                      >
                      <div>
                        <strong>{{ trade.symbol }}</strong
                        ><small :title="trade.instrumentLabel || trade.notes">{{
                          trade.instrumentLabel ||
                          trade.notes ||
                          (trade.assetClass === 'OPT'
                            ? 'OPTION'
                            : trade.assetClass || 'STOCK') +
                            ' · ' +
                            trade.currency
                        }}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      class="side-badge"
                      :class="trade.side.toLowerCase()"
                      >{{ trade.side === 'BUY' ? '↗ 买入' : '↙ 卖出' }}</span
                    >
                  </td>
                  <td class="numeric">{{ money(trade.price) }}</td>
                  <td class="numeric">{{ number(trade.quantity, 6) }}</td>
                  <td class="numeric">{{ money(tradeGrossAmount(trade)) }}</td>
                  <td class="numeric muted">{{ money(trade.fee) }}</td>
                  <td
                    class="numeric"
                    :class="
                      tradePnlKnown(trade)
                        ? trade.realizedPnl! >= 0
                          ? 'positive'
                          : 'negative'
                        : 'muted'
                    "
                  >
                    {{
                      tradePnlKnown(trade)
                        ? `${trade.realizedPnl! > 0 ? '+' : ''}${money(trade.realizedPnl)}`
                        : '待结算 / 核对'
                    }}
                  </td>
                  <td class="date-column muted">
                    {{ tradeDate(trade.executedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!shownTrades.length" class="empty-state">
            <Icon name="journal" :size="30" />
            <h3>
              {{
                query || side !== 'ALL' || fromDate || toDate
                  ? '没有符合筛选的交易'
                  : '你的第一笔交易，值得被记录。'
              }}
            </h3>
            <p>
              {{
                query || side !== 'ALL' || fromDate || toDate
                  ? '调整筛选条件，查看其他记录。'
                  : '添加成交记录，或导入已有账本。'
              }}
            </p>
            <button
              v-if="!current.trades.length"
              class="text-button"
              @click="openRecord()"
            >
              记录第一笔交易 ↗
            </button>
          </div>
          <button
            v-if="page === 'journal' && filteredTrades.length > journalLimit"
            class="load-more"
            @click="journalLimit += 30"
          >
            再显示 30 笔交易
          </button>
          <div class="table-foot">
            <span
              >{{ demo ? 'DEMO RECORDS' : 'EXECUTION RECORDS' }}
              <span class="footer-dot">·</span> {{ current.baseCurrency }}</span
            ><span>{{
              page === 'overview'
                ? `最近 ${shownTrades.length} 笔`
                : `显示 ${pagedTrades.length} / ${filteredTrades.length} 笔`
            }}</span>
          </div>
        </section>
        <section v-if="page === 'positions'" class="panel positions-panel">
          <div class="panel-heading">
            <div>
              <h2>
                本期持仓
                <small>{{
                  authoritativeHoldings ? 'Broker positions' : 'Cost basis'
                }}</small>
              </h2>
              <p>
                {{
                  authoritativeHoldings
                    ? `IBKR 持仓快照 · ${current.holdingsDate} · 均价按合约报价单位显示。`
                    : '根据股票成交记录计算剩余数量与平均成本，包含手续费。'
                }}
              </p>
            </div>
            <span class="label-pill">{{ positions.length }} 个标的</span>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>交易标的</th>
                  <th class="numeric">持有数量</th>
                  <th class="numeric">持仓均价</th>
                  <th class="numeric">
                    {{ authoritativeHoldings ? '最新市值' : '剩余成本' }}
                  </th>
                  <th class="numeric">占比</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(p, i) in topPositions"
                  :key="p.instrumentLabel || p.symbol"
                >
                  <td>
                    <div class="symbol-cell">
                      <span
                        class="ticker-avatar"
                        :style="{'--ticker-color': allocationColors[i % 5]}"
                        >{{ p.symbol[0] }}</span
                      >
                      <div>
                        <strong>{{ p.symbol }}</strong
                        ><small :title="p.instrumentLabel">{{
                          p.instrumentLabel || p.assetClass || 'STOCK'
                        }}</small>
                      </div>
                    </div>
                  </td>
                  <td class="numeric">{{ number(p.quantity, 6) }}</td>
                  <td class="numeric">{{ money(p.averageCost) }}</td>
                  <td class="numeric">{{ money(positionValue(p)) }}</td>
                  <td class="numeric">
                    {{
                      number(
                        (Math.abs(positionValue(p)) /
                          Math.max(investedCost, 1)) *
                          100,
                        1,
                      )
                    }}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!positions.length" class="empty-state">
            <Icon name="layers" :size="32" />
            <h3>让第一笔买入，开启你的组合。</h3>
            <p>导入或添加交易后，持仓会自动计算。</p>
            <button class="text-button" @click="openRecord()">
              记录交易 ↗
            </button>
          </div>
          <div class="table-foot">
            只跟踪 Day 0
            后有买入记录的当前持仓。不同期权合约分别展示，读取时间可能不同。
          </div>
        </section>
        <section v-if="page === 'timeline'" class="timeline-section">
          <div class="origin-card">
            <span class="origin-star">✳</span>
            <div>
              <small>THE BEGINNING</small>
              <h2>
                Day 0 <span>{{ current.dayZero ?? '尚未设定' }}</span>
              </h2>
              <p>每一段长期旅程，都始于一次决定。</p>
            </div>
            <button class="text-button" @click="switchPage('settings')">
              设置起点 <Icon name="arrow" :size="16" />
            </button>
          </div>
          <div class="timeline-actions">
            <h2>资金与账户轨迹</h2>
            <button class="quiet-button" @click="openRecord('cashflow')">
              <Icon name="plus" :size="15" />记录入出金
            </button>
          </div>
          <div v-for="event in timeline" :key="event.id" class="timeline-row">
            <span class="timeline-node"
              ><Icon :name="event.icon" :size="16" /></span
            ><span class="event-date">{{ event.date }}</span>
            <div>
              <strong>{{ event.kind }}</strong>
              <p>{{ event.description }}</p>
            </div>
            <span class="event-value">{{ money(event.amount) }}</span>
          </div>
          <div v-if="!timeline.length" class="empty-state">
            <h3>时间会留下足迹。</h3>
            <p>添加账户快照或入出金记录，开始你的时间轴。</p>
          </div>
        </section>
        <section v-if="page === 'settings'" class="settings-layout">
          <article class="panel connection-panel">
            <div class="connection-logo">
              <span>IB</span>
              <div>
                <h2>Interactive Brokers</h2>
                <p>READ-ONLY · FLEX WEB SERVICE</p>
              </div>
              <span class="label-pill">{{
                publicJournal.source === 'ibkr-connector'
                  ? '已载入账户快照'
                  : publicJournal.source === 'ibkr-flex'
                    ? '已导入报表'
                    : '尚未配置'
              }}</span>
            </div>
            <p v-if="current.coverage" class="settings-intro coverage-detail">
              {{ current.coverage.note }}
            </p>
            <p class="settings-intro">
              把每一次成交，变成持续积累的记录。通过 IBKR Flex
              报表同步买卖明细、现金余额和账户净值。
            </p>
            <div class="connection-steps">
              <div>
                <span>01</span>
                <p>
                  <strong>创建 Activity Flex Query</strong
                  ><small
                    >在 IBKR「Performance & Reports → Flex Queries」创建 XML
                    查询，选择成交明细、现金流水和净值区块。</small
                  >
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>配置安全凭证</strong
                  ><small
                    >在项目的 GitHub Secrets 中保存 Flex Token 和 Query
                    ID。凭证仅用于后台读取报表。</small
                  >
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>开启公开账本同步</strong
                  ><small
                    >确认 Day
                    0、报表时区并启用同步，账本会随每日报表更新。</small
                  >
                </p>
              </div>
            </div>
            <div class="connection-note">
              <Icon name="info" :size="17" />
              <p>
                Flex Activity
                余额截至上一营业日。历史净值曲线由每日快照积累；登录 IBKR
                账户本身不会自动连接此页面。
              </p>
            </div>
            <button class="primary-button" @click="showSetup = !showSetup">
              {{ showSetup ? '收起配置说明' : '查看接入配置' }}
              <Icon name="arrow" :size="15" />
            </button>
            <div v-if="showSetup" class="setup-detail">
              <p>仓库 Settings → Secrets and variables → Actions</p>
              <dl>
                <dt>Secrets</dt>
                <dd>IBKR_FLEX_TOKEN<br />IBKR_ACTIVITY_QUERY_ID</dd>
                <dt>Variables</dt>
                <dd>
                  IBKR_SYNC_ENABLED = true<br />TRADING_PUBLIC_ENABLED = true<br />TRADING_DAY_ZERO
                  = 你的起始日期<br />IBKR_REPORT_TIME_ZONE = 报表时区
                </dd>
              </dl>
              <a
                href="https://github.com/ZhiyuL1u/mywebsite/blob/feat/day-zero-trading-journal/docs/trading-ibkr.md"
                target="_blank"
                rel="noopener noreferrer"
                class="text-button"
                >完整接入文档 ↗</a
              >
            </div>
          </article>
          <div class="settings-side">
            <article class="panel settings-card">
              <p class="eyebrow">YOUR STARTING POINT</p>
              <h2>定义你的 Day 0</h2>
              <p>第一笔入金，或第一笔交易。<br />选一个值得记住的开始。</p>
              <label class="field"
                >起始日期<input
                  type="date"
                  v-model="setupDay"
                  :max="dateToday" /></label
              ><button class="quiet-button full-width" @click="setDayZero">
                保存起点 <Icon name="check" :size="15" />
              </button>
            </article>
            <article class="panel settings-card">
              <p class="eyebrow">TAKE YOUR DATA WITH YOU</p>
              <h2>导入与备份</h2>
              <p>
                JSON 载入完整账本，标准 CSV 合并交易。本机记录可随时导出备份。
              </p>
              <button
                class="quiet-button full-width"
                @click="fileInput?.click()"
              >
                <Icon name="download" :size="15" />导入 JSON / CSV</button
              ><button class="quiet-button full-width" @click="exportJson">
                <Icon name="download" :size="15" />导出完整账本</button
              ><button
                class="text-button template-link"
                @click="downloadTemplate"
              >
                下载 CSV 模板 ↗</button
              ><button
                v-if="localJournal"
                class="reset-link"
                @click="resetDialog?.showModal()"
              >
                清除本机草稿，恢复公开账本
              </button>
            </article>
          </div>
        </section>
        <section v-if="page === 'overview'" class="journey-strip">
          <div class="journey-zero">00<small>DAY ZERO</small></div>
          <div class="journey-track">
            <span class="track-dot" />
            <div />
            <span class="track-dot current-dot" />
          </div>
          <div class="journey-now">
            <span>STILL WRITING THE STORY</span>
            <p>
              {{
                current.dayZero
                  ? `${current.dayZero} — 今天`
                  : '从今天开始，写下你的第一笔。'
              }}
            </p>
          </div>
          <Icon name="arrow" :size="24" />
        </section>
        <footer class="page-footer">
          <span
            >© {{ new Date().getFullYear() }} ZHIYU LIU
            <span class="footer-dot">/</span> DAY ZERO</span
          ><span>记录是为了更好地理解自己的决策。</span
          ><a href="/">Back to portfolio ↗</a>
        </footer>
      </main>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".json,.csv"
      class="visually-hidden"
      tabindex="-1"
      aria-label="导入账本文件"
      @change="importFile"
    />
    <div v-if="notice" class="toast" role="status">
      <Icon name="info" :size="17" /><span>{{ notice }}</span
      ><button class="icon-button" @click="notice = ''" aria-label="关闭提示">
        <Icon name="close" :size="15" />
      </button>
    </div>
    <dialog ref="modal" class="record-dialog">
      <div class="dialog-header">
        <div>
          <p class="eyebrow">A NEW ENTRY</p>
          <h2>
            {{
              recordKind === 'trade'
                ? '记录一次决策。'
                : recordKind === 'snapshot'
                  ? '留下一个刻度。'
                  : '记录资金流动。'
            }}
          </h2>
        </div>
        <button
          class="icon-button"
          @click="modal?.close()"
          aria-label="关闭记录窗口"
        >
          <Icon name="close" />
        </button>
      </div>
      <div class="record-tabs">
        <button
          v-for="tab in [
            {v: 'trade' as const, t: '买入 / 卖出'},
            {v: 'snapshot' as const, t: '账户快照'},
            {v: 'cashflow' as const, t: '入金 / 出金'},
          ]"
          :key="tab.v"
          :class="{active: recordKind === tab.v}"
          @click="
            recordKind = tab.v;
            recordError = '';
          "
        >
          {{ tab.t }}
        </button>
      </div>
      <p class="local-note">
        手动录入仅支持股票；期权请通过报表导入。本机保存 ·
        {{ publicJournal.baseCurrency }}
      </p>
      <form @submit.prevent="addRecord">
        <div class="form-grid">
          <label class="field"
            >日期<input
              type="date"
              v-model="draft.date"
              :max="dateToday"
              required /></label
          ><label v-if="recordKind === 'trade'" class="field"
            >成交时间（北京时间）<input
              type="time"
              v-model="draft.time"
              required /></label
          ><template v-if="recordKind === 'trade'"
            ><label class="field"
              >交易代码<input
                v-model="draft.symbol"
                placeholder="例如 AAPL"
                maxlength="30"
                required /></label
            ><label class="field"
              >交易方向<select v-model="draft.side">
                <option value="BUY">买入 BUY</option>
                <option value="SELL">卖出 SELL</option>
              </select></label
            ><label class="field"
              >成交数量<input
                type="number"
                v-model="draft.quantity"
                placeholder="0"
                step="any"
                min="0.000001"
                required /></label
            ><label class="field"
              >成交价<input
                type="number"
                v-model="draft.price"
                placeholder="0.00"
                step="any"
                min="0.000001"
                required /></label
            ><label class="field"
              >手续费<input
                type="number"
                v-model="draft.fee"
                step="any"
                min="0"
                required /></label></template
          ><template v-else-if="recordKind === 'snapshot'"
            ><label class="field"
              >账户净值<input
                type="number"
                v-model="draft.nav"
                step="any"
                placeholder="0.00"
                required /></label
            ><label class="field"
              >现金余额<input
                type="number"
                v-model="draft.cash"
                step="any"
                placeholder="0.00"
                required /></label></template
          ><template v-else
            ><label class="field"
              >资金方向<select v-model="draft.flowType">
                <option value="DEPOSIT">入金 DEPOSIT</option>
                <option value="WITHDRAWAL">出金 WITHDRAWAL</option>
              </select></label
            ><label class="field"
              >金额<input
                type="number"
                v-model="draft.amount"
                step="any"
                min="0.01"
                placeholder="0.00"
                required /></label></template
          ><label v-if="recordKind !== 'snapshot'" class="field span-two"
            >{{ recordKind === 'trade' ? '交易笔记' : '备注'
            }}<textarea
              v-model="draft.notes"
              placeholder="为什么做出这次决定？"
              rows="3"
              maxlength="1000"
            />
          </label>
        </div>
        <p v-if="recordError" role="alert" class="form-error">
          {{ recordError }}
        </p>
        <button class="primary-button full-width save-record" type="submit">
          保存记录 <Icon name="arrow" :size="17" />
        </button>
      </form>
    </dialog>
    <dialog ref="resetDialog" class="record-dialog confirm-dialog">
      <h2>清除本机草稿？</h2>
      <p>这会移除此浏览器保存的手动记录。请先导出备份；公开账本不会受影响。</p>
      <div class="confirm-actions">
        <button class="quiet-button" @click="resetDialog?.close()">取消</button
        ><button class="quiet-button" @click="exportJson">先导出备份</button
        ><button class="primary-button" @click="resetLocal">清除草稿</button>
      </div>
    </dialog>
  </div>
</template>
