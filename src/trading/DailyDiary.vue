<script setup lang="ts">
import {computed, ref, watch, nextTick, onMounted} from 'vue';
import Icon from './Icon.vue';
import {
  tradeDateKey,
  tradeGrossAmount,
  type Journal,
  type Trade,
} from './model';
const props = defineProps<{
  journal: Journal;
  demo: boolean;
  initialDate?: string;
}>();
const emit = defineEmits<{
  saveDiary: [date: string, text: string];
  saveTradeNote: [id: string, text: string];
  record: [date: string];
}>();
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
}).format(new Date());
const selected = ref(props.initialDate || today);
const calendar = ref<HTMLDivElement | null>(null);
watch(
  selected,
  (value, previous) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      value > today ||
      (props.journal.dayZero && value < props.journal.dayZero)
    ) {
      selected.value = previous || today;
      return;
    }
    nextTick(() =>
      calendar.value
        ?.querySelector('.active')
        ?.scrollIntoView({block: 'nearest', inline: 'center'}),
    );
  },
  {flush: 'sync'},
);
onMounted(() =>
  nextTick(() =>
    calendar.value
      ?.querySelector('.active')
      ?.scrollIntoView({block: 'nearest', inline: 'center'}),
  ),
);
const days = computed(() => {
  const end = today;
  const first = props.journal.dayZero ?? end;
  const result: string[] = [];
  // Keep long-running journals fast; the date picker still opens any earlier day.
  for (
    let i = 0;
    i <
    Math.min(
      45,
      Math.floor((Date.parse(end) - Date.parse(first)) / 86400000) + 1,
    );
    i++
  )
    result.push(
      new Date(Date.parse(end) - i * 86400000).toISOString().slice(0, 10),
    );
  return result.reverse();
});
const selectedDay = computed(() =>
  props.journal.dayZero
    ? Math.floor(
        (Date.parse(selected.value) - Date.parse(props.journal.dayZero)) /
          86400000,
      )
    : 0,
);
const dailyTrades = computed(() =>
  props.journal.trades
    .filter((t) => tradeDateKey(t.executedAt) === selected.value)
    .sort((a, b) => Date.parse(a.executedAt) - Date.parse(b.executedAt)),
);
const buys = computed(() => dailyTrades.value.filter((t) => t.side === 'BUY'));
const sells = computed(() =>
  dailyTrades.value.filter((t) => t.side === 'SELL'),
);
const realized = computed(() => {
  if (!dailyTrades.value.length) return null;
  return dailyTrades.value.every((t) => t.realizedPnl !== undefined)
    ? dailyTrades.value.reduce((sum, t) => sum + t.realizedPnl!, 0)
    : null;
});
const fees = computed(() =>
  dailyTrades.value.reduce((sum, t) => sum + t.fee, 0),
);
const daySnapshot = computed(() =>
  props.journal.snapshots.find((s) => s.date === selected.value),
);
const note = ref('');
const savedNote = computed(
  () =>
    props.journal.dailyNotes?.find((n) => n.date === selected.value)?.text ??
    '',
);
watch(
  [selected, () => props.journal],
  () => {
    note.value = savedNote.value;
  },
  {immediate: true},
);
const editingTrade = ref<string | null>(null);
const tradeNote = ref('');
function editTrade(t: Trade) {
  editingTrade.value = t.id;
  tradeNote.value = t.notes ?? '';
}
function money(v: number | null | undefined) {
  return v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.journal.baseCurrency,
        maximumFractionDigits: 2,
      }).format(v);
}
function signed(v: number | null | undefined) {
  return v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${money(v)}`;
}
function time(t: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(t));
}
function dayName(d: string) {
  return new Intl.DateTimeFormat('en-US', {weekday: 'short', timeZone: 'UTC'})
    .format(new Date(d))
    .toUpperCase();
}
function dateNumber(d: string) {
  return d.slice(8, 10);
}
function tradeCount(d: string) {
  return props.journal.trades.filter((t) => tradeDateKey(t.executedAt) === d)
    .length;
}
const activeHoldings = computed(
  () => props.journal.holdings?.filter((h) => h.quantity !== 0) ?? [],
);
const showHoldings = computed(
  () =>
    selected.value === props.journal.holdingsDate &&
    activeHoldings.value.length > 0,
);
</script>

<template>
  <section class="diary-hero">
    <div>
      <p class="eyebrow"><span />THE DAILY TRADING JOURNAL</p>
      <h1>Trade. Reflect.<br /><em>Repeat.</em></h1>
      <p>一天一页，记下交易，也记下思考。</p>
    </div>
    <div class="diary-hero-right">
      <span class="small-label">WRITE YOUR OWN STORY</span>
      <p>
        DAY
        <strong>{{ String(Math.max(0, selectedDay)).padStart(3, '0') }}</strong
        ><span class="blinking-block" />
      </p>
      <small>{{
        journal.dayZero
          ? `始于 ${journal.dayZero.replaceAll('-', '.')}`
          : '从今天，开始记录。'
      }}</small
      ><svg viewBox="0 0 220 70" aria-hidden="true">
        <path
          d="M0 63H220M0 43H220M0 23H220"
          fill="none"
          stroke="#b8f878"
          stroke-opacity=".07"
        />
        <path
          d="M0 55L22 50 38 53 60 32 78 41 98 22 118 30 138 16 155 22 177 8 196 13 220 3"
          fill="none"
          stroke="#b8f878"
          stroke-opacity=".2"
          stroke-width="1"
        />
      </svg>
    </div>
  </section>
  <div class="diary-toolbar">
    <div ref="calendar" class="diary-calendar" aria-label="选择日记日期">
      <button
        v-for="d in days"
        :key="d"
        :class="{active: selected === d, today: d === today}"
        :aria-pressed="selected === d"
        @click="
          selected = d;
          editingTrade = null;
        "
      >
        <span>{{ dayName(d) }}</span
        ><strong>{{ dateNumber(d) }}</strong
        ><i
          :class="{
            hasTrades: tradeCount(d) > 0,
            hasNote: journal.dailyNotes?.some((n) => n.date === d && n.text),
          }"
        /><small v-if="d === today">TODAY</small>
      </button>
    </div>
    <label class="diary-date-input"
      ><Icon name="timeline" :size="14" /><input
        type="date"
        v-model="selected"
        :min="journal.dayZero ?? undefined"
        :max="today"
        aria-label="选择日记日期"
    /></label>
  </div>
  <div class="diary-day-heading">
    <div>
      <span class="day-kicker"
        >PAGE {{ String(Math.max(0, selectedDay)).padStart(3, '0') }}</span
      >
      <h2>
        {{ selected.replaceAll('-', '.')
        }}<span>{{
          selected === today ? '今天这一页' : dayName(selected)
        }}</span>
      </h2>
    </div>
    <button class="primary-button" @click="emit('record', selected)">
      <Icon name="plus" :size="15" />记录交易
    </button>
  </div>
  <div class="diary-summary">
    <article>
      <span>当日操作</span>
      <p>{{ String(dailyTrades.length).padStart(2, '0') }}<small>笔</small></p>
      <div>{{ buys.length }} 买入 <span>/</span> {{ sells.length }} 卖出</div>
    </article>
    <article>
      <span>当日已实现盈亏</span>
      <p
        :class="
          realized !== null ? (realized >= 0 ? 'positive' : 'negative') : ''
        "
      >
        {{ signed(realized) }}
      </p>
      <div>
        {{
          realized !== null
            ? '券商逐笔已实现盈亏汇总'
            : '等待完整的券商盈亏数据'
        }}
      </div>
    </article>
    <article>
      <span>当日手续费</span>
      <p>
        {{ money(fees) }}<small>{{ journal.baseCurrency }}</small>
      </p>
      <div>含返佣调整</div>
    </article>
    <article>
      <span>当日账户净值</span>
      <p>{{ money(daySnapshot?.netAssetValue) }}</p>
      <div>
        {{ daySnapshot ? '账户快照 · 含持仓与现金' : '当天暂无账户快照' }}
      </div>
    </article>
  </div>
  <div class="diary-columns">
    <section class="panel daily-trades">
      <div class="panel-heading">
        <div>
          <h2>今天做了什么 <small>Trading activity</small></h2>
          <p>按成交时间 · 北京时间 UTC+8</p>
        </div>
        <span class="label-pill">{{ dailyTrades.length }} 笔</span>
      </div>
      <div v-if="!dailyTrades.length" class="empty-state">
        <span class="rest-day-mark">—</span>
        <h3>今天，没有成交记录。</h3>
        <p>观察、等待，也值得写进日记。</p>
      </div>
      <article v-for="(t, i) in dailyTrades" :key="t.id" class="diary-trade">
        <div class="diary-trade-time">
          <span>{{ time(t.executedAt) }}</span
          ><span class="execution-dot" />
        </div>
        <div class="diary-trade-body">
          <div class="diary-trade-top">
            <div class="diary-ticker">
              <span
                class="ticker-avatar"
                :style="{
                  '--ticker-color': t.side === 'BUY' ? '#b8f878' : '#e4b77b',
                }"
                >{{ t.symbol[0] }}</span
              >
              <div>
                <strong>{{ t.symbol }}</strong
                ><small>{{
                  t.assetClass === 'OPT'
                    ? 'OPTION / 期权'
                    : t.assetClass || 'STOCK / 股票'
                }}</small>
              </div>
            </div>
            <span class="side-badge" :class="t.side.toLowerCase()"
              >{{ t.side === 'BUY' ? '↗ 买入' : '↙ 卖出'
              }}{{
                t.positionEffect === 'OPEN'
                  ? ' · 开仓'
                  : t.positionEffect === 'CLOSE'
                    ? ' · 平仓'
                    : ''
              }}</span
            >
          </div>
          <p class="trade-contract" :title="t.instrumentLabel">
            {{ t.instrumentLabel || t.symbol }}
          </p>
          <div class="diary-execution-data">
            <span
              ><small>数量 × 成交价</small
              ><strong>{{ t.quantity }} × {{ money(t.price) }}</strong></span
            ><span
              ><small>成交金额</small
              ><strong>{{ money(tradeGrossAmount(t)) }}</strong></span
            ><span
              ><small>已实现盈亏</small
              ><strong
                :class="
                  t.realizedPnl !== undefined
                    ? t.realizedPnl >= 0
                      ? 'positive'
                      : 'negative'
                    : ''
                "
                >{{
                  t.realizedPnl === 0 &&
                  t.side === 'BUY' &&
                  t.positionEffect !== 'CLOSE'
                    ? '待结算'
                    : signed(t.realizedPnl)
                }}</strong
              ></span
            >
          </div>
          <div v-if="editingTrade !== t.id" class="trade-note-line">
            <p v-if="t.notes">
              <Icon name="journal" :size="13" />{{ t.notes }}
            </p>
            <button class="text-button" :disabled="demo" @click="editTrade(t)">
              <Icon name="journal" :size="13" />{{
                t.notes ? '编辑交易笔记' : '写下这笔交易的想法'
              }}
              <span>↗</span>
            </button>
          </div>
          <div v-else class="inline-note-editor">
            <textarea
              v-model="tradeNote"
              :aria-label="`${t.symbol} 交易笔记`"
              rows="3"
              maxlength="1000"
              placeholder="开仓逻辑、目标、止损，或此刻的想法…"
            />
            <div>
              <button class="text-button" @click="editingTrade = null">
                取消</button
              ><button
                class="quiet-button"
                @click="
                  emit('saveTradeNote', t.id, tradeNote);
                  editingTrade = null;
                "
              >
                保存笔记 <Icon name="check" :size="13" />
              </button>
            </div>
          </div>
        </div>
      </article>
      <p
        v-if="
          dailyTrades.some((t) => t.assetClass === 'OPT' && !t.positionEffect)
        "
        class="diary-footnote"
      >
        部分期权成交暂缺到期日、行权价及开平标记，待 Flex 报表补全。
      </p>
    </section>
    <div class="daily-reflection-column">
      <section class="panel daily-note-panel">
        <div class="panel-heading">
          <div>
            <h2>给今天留几句话 <small>Daily reflection</small></h2>
            <p>关于交易，也关于自己。</p>
          </div>
          <Icon name="journal" :size="18" />
        </div>
        <div class="daily-note-body">
          <span class="note-date-label">{{ selected }} / PERSONAL NOTES</span
          ><textarea
            v-model="note"
            :disabled="demo"
            rows="10"
            maxlength="5000"
            aria-label="当日交易日记"
            placeholder="今天为什么开仓？&#10;&#10;哪些判断得到了验证，哪些没有？&#10;&#10;仓位和风险是否在计划内？&#10;&#10;如果再来一次，我会改变什么？"
          />
          <div class="note-bottom">
            <span
              >{{
                demo
                  ? '演示模式不保存笔记'
                  : note === savedNote && savedNote
                    ? '已保存到本机'
                    : '笔记保存在当前浏览器'
              }}<small>{{ note.length }} / 5000</small></span
            ><button
              class="quiet-button"
              :disabled="demo || note === savedNote"
              @click="emit('saveDiary', selected, note)"
            >
              保存日记 <Icon name="check" :size="13" />
            </button>
          </div>
        </div>
      </section>
      <section v-if="showHoldings" class="panel diary-holdings-panel">
        <div class="panel-heading">
          <div>
            <h2>持仓的后续 <small>Still in the story</small></h2>
            <p>本期持仓跟踪 · {{ journal.holdingsDate }}</p>
          </div>
          <Icon name="positions" :size="17" />
        </div>
        <div
          class="diary-holding"
          v-for="holding in activeHoldings"
          :key="holding.instrumentLabel"
        >
          <div>
            <strong>{{ holding.symbol }}</strong
            ><small>{{ holding.instrumentLabel }}</small>
          </div>
          <span
            :class="
              holding.unrealizedPnl !== undefined
                ? holding.unrealizedPnl >= 0
                  ? 'positive'
                  : 'negative'
                : 'holding-market-value'
            "
            ><small v-if="holding.unrealizedPnl === undefined">市值 </small
            >{{
              holding.unrealizedPnl === undefined
                ? money(holding.marketValue)
                : signed(holding.unrealizedPnl)
            }}</span
          >
        </div>
        <p class="diary-footnote">
          仅跟踪本期买入标的的当前持仓。未核对完整合约时显示市值，浮动收益待报表确认。
        </p>
      </section>
      <div class="diary-quote">
        <span>“</span>
        <p>The best trade is the one<br />you understand.</p>
        <small>记录当时的逻辑，留给以后的自己。</small>
      </div>
    </div>
  </div>
</template>
