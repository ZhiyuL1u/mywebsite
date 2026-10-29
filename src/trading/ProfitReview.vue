<script setup lang="ts">
import {computed, ref} from 'vue';
import Icon from './Icon.vue';
import {
  tradeDateKey,
  tradeGrossAmount,
  type Journal,
  type Trade,
} from './model';
const props = defineProps<{journal: Journal}>();
const emit = defineEmits<{openDiary: [date: string]}>();
const filter = ref<'ALL' | 'WIN' | 'LOSS' | 'PENDING'>('ALL');
const search = ref('');
const known = (t: Trade) =>
  t.realizedPnl !== undefined &&
  (t.realizedPnl !== 0 ||
    t.positionEffect === 'CLOSE' ||
    (t.side === 'SELL' && t.positionEffect !== 'OPEN'));
const wins = computed(() =>
  props.journal.trades.filter((t) => known(t) && t.realizedPnl! > 0),
);
const losses = computed(() =>
  props.journal.trades.filter((t) => known(t) && t.realizedPnl! < 0),
);
const settled = computed(() => props.journal.trades.filter(known));
const total = computed(() =>
  settled.value.reduce((sum, t) => sum + t.realizedPnl!, 0),
);
const winningTotal = computed(() =>
  wins.value.reduce((sum, t) => sum + t.realizedPnl!, 0),
);
const losingTotal = computed(() =>
  losses.value.reduce((sum, t) => sum + t.realizedPnl!, 0),
);
const visible = computed(() =>
  [...props.journal.trades]
    .sort((a, b) => Date.parse(b.executedAt) - Date.parse(a.executedAt))
    .filter(
      (t) =>
        (!search.value ||
          `${t.symbol} ${t.instrumentLabel ?? ''} ${t.notes ?? ''}`
            .toLowerCase()
            .includes(search.value.toLowerCase())) &&
        (filter.value === 'ALL' ||
          (filter.value === 'WIN' && known(t) && t.realizedPnl! > 0) ||
          (filter.value === 'LOSS' && known(t) && t.realizedPnl! < 0) ||
          (filter.value === 'PENDING' && !known(t))),
    ),
);
const limit = ref(30);
function money(v: number | null | undefined) {
  return v === null || v === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: props.journal.baseCurrency,
        maximumFractionDigits: 2,
      }).format(v);
}
function signed(v: number) {
  return `${v > 0 ? '+' : ''}${money(v)}`;
}
</script>
<template>
  <div class="diary-summary profit-summary">
    <article>
      <span>本期已实现盈亏</span>
      <p :class="settled.length ? (total >= 0 ? 'positive' : 'negative') : ''">
        {{ settled.length ? signed(total) : '—' }}
      </p>
      <div>{{ settled.length }} 笔有券商结算结果</div>
    </article>
    <article>
      <span>赚钱的交易</span>
      <p class="positive">{{ wins.length }}<small>笔</small></p>
      <div>{{ signed(winningTotal) }}</div>
    </article>
    <article>
      <span>亏钱的交易</span>
      <p class="negative">{{ losses.length }}<small>笔</small></p>
      <div>{{ signed(losingTotal) }}</div>
    </article>
    <article>
      <span>胜率</span>
      <p>
        {{
          wins.length + losses.length
            ? ((wins.length / (wins.length + losses.length)) * 100).toFixed(1) +
              '%'
            : '—'
        }}
      </p>
      <div>盈利笔数 / 盈利及亏损笔数</div>
    </article>
  </div>
  <section class="panel profit-panel">
    <div class="panel-heading">
      <div>
        <h2>每一笔，赚了还是亏了 <small>Execution P&L</small></h2>
        <p>盈亏使用券商结算结果；未确认结算的买入保持待核对。</p>
      </div>
    </div>
    <div class="table-toolbar">
      <label class="search-field"
        ><Icon name="search" :size="15" /><input
          v-model="search"
          aria-label="搜索逐笔盈亏"
          placeholder="搜索代码、合约或笔记…"
      /></label>
      <div class="filter-tabs" aria-label="按交易结果筛选">
        <button
          v-for="item in [
            {v: 'ALL' as const, t: '全部'},
            {v: 'WIN' as const, t: '盈利'},
            {v: 'LOSS' as const, t: '亏损'},
            {v: 'PENDING' as const, t: '待结算'},
          ]"
          :key="item.v"
          :aria-pressed="filter === item.v"
          :class="{active: filter === item.v}"
          @click="filter = item.v"
        >
          {{ item.t }}
        </button>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>交易标的</th>
            <th>方向 / 结果</th>
            <th class="numeric">数量 × 价格</th>
            <th class="numeric">成交金额</th>
            <th class="numeric">这笔赚了多少</th>
            <th class="date-column">日记</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in visible.slice(0, limit)" :key="t.id">
            <td>
              <div class="symbol-cell">
                <span
                  class="ticker-avatar"
                  :style="{
                    '--ticker-color': known(t)
                      ? t.realizedPnl! >= 0
                        ? '#b8f878'
                        : '#ef9e91'
                      : '#8ebbf0',
                  }"
                  >{{ t.symbol[0] }}</span
                >
                <div>
                  <strong>{{ t.symbol }}</strong
                  ><small :title="t.instrumentLabel">{{
                    t.instrumentLabel || t.assetClass || 'STOCK'
                  }}</small>
                </div>
              </div>
            </td>
            <td>
              <span class="result-caption">{{
                t.side === 'BUY' ? '买入' : '卖出'
              }}</span
              ><span
                class="result-badge"
                :class="
                  !known(t)
                    ? 'pending'
                    : t.realizedPnl! > 0
                      ? 'win'
                      : t.realizedPnl! < 0
                        ? 'loss'
                        : 'flat'
                "
                >{{
                  !known(t)
                    ? '待结算 / 核对'
                    : t.realizedPnl! > 0
                      ? '盈利'
                      : t.realizedPnl! < 0
                        ? '亏损'
                        : '零已实现盈亏'
                }}</span
              >
            </td>
            <td class="numeric">{{ t.quantity }} × {{ money(t.price) }}</td>
            <td class="numeric">{{ money(tradeGrossAmount(t)) }}</td>
            <td
              class="numeric execution-profit"
              :class="
                known(t)
                  ? t.realizedPnl! >= 0
                    ? 'positive'
                    : 'negative'
                  : 'muted'
              "
            >
              {{ known(t) ? signed(t.realizedPnl!) : '—'
              }}<small>{{
                known(t) ? '券商已实现盈亏' : '等待合约及平仓结果'
              }}</small>
            </td>
            <td class="date-column">
              <button
                class="text-button"
                @click="emit('openDiary', tradeDateKey(t.executedAt))"
              >
                {{ tradeDateKey(t.executedAt).slice(5).replace('-', '.') }}
                <Icon name="up" :size="12" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!visible.length" class="empty-state">
      <Icon name="positions" :size="28" />
      <h3>还没有符合筛选的交易。</h3>
      <p>已结算的成交会显示券商提供的真实盈亏。</p>
    </div>
    <button
      v-if="visible.length > limit"
      class="load-more"
      @click="limit += 30"
    >
      再显示 30 笔
    </button>
    <div class="table-foot">
      <span>按成交分笔统计，部分成交分开显示；不是往返交易胜率。</span
      ><span>{{ visible.length }} 笔</span>
    </div>
  </section>
</template>
