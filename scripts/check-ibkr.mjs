import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createFlexClient, dateRanges, emptyJournal, executionTimestamp, JournalImportError, mergeJournals, normalizeJournal, parseActivityReport, publicationDate } from './lib/ibkr-flex.mjs';
import { parseArguments, syncJournal } from './sync-ibkr.mjs';

// Entirely synthetic fixtures: never read the owner's real trading journal.
const report = `<FlexQueryResponse type="AF"><FlexStatements><FlexStatement accountId="SYNTHETIC" fromDate="20261001" toDate="20261019">
<AccountInformation currency="USD"/>
<Trades>
  <Trade accountId="SYNTHETIC" ibExecID="synthetic-old" dateTime="20261011;070000" assetCategory="CASH"/>
  <Trade accountId="SYNTHETIC" ibExecID="synthetic-buy" dateTime="20261012;090000" symbol="SYN OPTION" underlyingSymbol="SYN" description="Synthetic option" assetCategory="OPT" expiry="20261023" strike="100" putCall="C" multiplier="100" currency="USD" fxRateToBase="1" levelOfDetail="EXECUTION" buySell="BUY" quantity="2" tradePrice="1.25" ibCommission="-1.1" ibCommissionCurrency="USD" taxes="0" fifoPnlRealized="0" openCloseIndicator="O"/>
  <Trade accountId="SYNTHETIC" ibExecID="synthetic-sell" dateTime="20261013;090000" symbol="SYN OPTION" underlyingSymbol="SYN" description="Synthetic option" assetCategory="OPT" expiry="20261023" strike="100" putCall="C" multiplier="100" currency="USD" fxRateToBase="1" levelOfDetail="EXECUTION" buySell="SELL" quantity="-1" tradePrice="1.55" ibCommission="0.10" ibCommissionCurrency="USD" taxes="0" fifoPnlRealized="29.5" openCloseIndicator="C"/>
</Trades>
<CashTransactions>
  <CashTransaction accountId="SYNTHETIC" transactionID="old-funding" dateTime="20261011;000000" type="Deposits/Withdrawals" amount="10" currency="USD"/>
  <CashTransaction accountId="SYNTHETIC" transactionID="synthetic-funding" dateTime="20261012;000000" type="Deposits/Withdrawals" amount="1000" currency="USD" description="PRIVATE BROKER DESCRIPTION"/>
  <CashTransaction accountId="SYNTHETIC" transactionID="synthetic-dividend" dateTime="20261013;000000" type="Dividends" amount="2" currency="USD"/>
</CashTransactions>
<EquitySummaryInBase><EquitySummaryByReportDateInBase reportDate="20261019" cash="10000" total="11000"/></EquitySummaryInBase>
<CashReport><CashReportCurrency currency="BASE_SUMMARY" fromDate="20261001" toDate="20261019" endingCash="10000"/></CashReport>
<OpenPositions>
  <OpenPosition assetCategory="STK" symbol="SYN" description="Synthetic stock" multiplier="1" currency="USD" fxRateToBase="1" levelOfDetail="SUMMARY" position="5" costBasisMoney="500" positionValue="510" fifoPnlUnrealized="10"/>
  <OpenPosition assetCategory="STK" symbol="OLD" description="Excluded older holding" multiplier="1" currency="USD" fxRateToBase="1" levelOfDetail="SUMMARY" position="1" costBasisMoney="500" positionValue="5" fifoPnlUnrealized="-495"/>
</OpenPositions>
</FlexStatement></FlexStatements></FlexQueryResponse>`;
const parse = (xml = report, options = {}) => parseActivityReport(xml, { baseCurrency: 'USD', reportTimeZone: 'UTC', ...options });
const success = '<FlexStatementResponse><Status>Success</Status><ReferenceCode>123456</ReferenceCode><url>https://attacker.invalid/never-use</url></FlexStatementResponse>';
const errorXml = (code, message = 'untrusted') => `<FlexStatementResponse><Status>Fail</Status><ErrorCode>${code}</ErrorCode><ErrorMessage>${message}</ErrorMessage></FlexStatementResponse>`;
const credentials = { token: '111111111111111111111111', queryId: '12345' };

await test('Activity parses option multipliers, signed rebates and broker realized P&L; removes excluded history and private fields', () => {
  const journal = parse();
  assert.equal(journal.dayZero, '2026-10-12');
  assert.equal(journal.trades.length, 2);
  assert.equal(journal.trades[0].id, 'ibkr-synthetic-buy');
  assert.equal(journal.trades[0].grossAmount, 250);
  assert.equal(journal.trades[0].fee, 1.1);
  assert.equal(journal.trades[1].fee, -0.1);
  assert.equal(journal.trades[1].quantity, 1);
  assert.equal(journal.trades[1].realizedPnl, 29.5);
  assert.equal(journal.trades[1].positionEffect, 'CLOSE');
  assert.match(journal.trades[0].instrumentLabel, /2026-10-23 CALL 100 ×100/);
  assert.equal(journal.cashflows.length, 1);
  assert.equal(journal.holdings.length, 1);
  assert.equal(journal.holdings[0].symbol, 'SYN');
  assert.equal(journal.holdings[0].averageCost, 100);
  for (const forbidden of ['SYNTHETIC', 'PRIVATE BROKER', 'accountId', 'old-funding', 'synthetic-old', 'Excluded older', 'rawXml', 'Token']) assert.ok(!JSON.stringify(journal).includes(forbidden));
});

await test('UTC+8 publication boundary and report-zone DST are explicit', () => {
  assert.equal(publicationDate('2026-10-11T15:59:59Z'), '2026-10-11');
  assert.equal(publicationDate('2026-10-11T16:00:00Z'), '2026-10-12');
  assert.equal(executionTimestamp('20261012;093000', 'America/New_York'), '2026-10-12T13:30:00.000Z');
  assert.throws(() => executionTimestamp('20261101;013000', 'America/New_York'), /夏令时/);
  assert.throws(() => executionTimestamp('20261012;093000'), /TIME_ZONE/);
  assert.throws(() => executionTimestamp('20260230;093000', 'UTC'), /日期/);
});

await test('Missing query fields, currencies, contracts and unsupported assets fail without leaking broker values', () => {
  assert.throws(() => parse(report.replaceAll('multiplier="100"', 'multiplier=""')), /乘数/);
  assert.throws(() => parse(report.replaceAll('expiry="20261023"', 'expiry=""')), /到期日/);
  assert.throws(() => parse(report.replaceAll('assetCategory="OPT"', 'assetCategory="FUT"')), /不支持/);
  assert.throws(() => parse(report.replaceAll('ibCommissionCurrency="USD"', 'ibCommissionCurrency="EUR"')), /非基础币种/);
  assert.throws(() => parse(report.replace('transactionID="synthetic-funding"', 'transactionID=""')), /Transaction ID/);
  assert.throws(() => parse(report.replaceAll('levelOfDetail="EXECUTION"', 'levelOfDetail="ORDER"')), /Executions/);
  assert.throws(() => parse(report.replace('endingCash="10000"', 'endingCash="9999"')), /不一致/);
  assert.throws(() => parse(report.replace('<Trades>', '<OtherTrades>').replace('</Trades>', '</OtherTrades>')), /缺少 Trades/);
  assert.throws(() => parse('<!DOCTYPE x [<!ENTITY example SYSTEM "file:///private">]><x/>'), /DTD/);
  assert.throws(() => parse('<broken>'), /XML/);
});

await test('Connector to Flex merges stable execution IDs, preserves notes/null cash/history and newer holdings', () => {
  const imported = parse();
  const seed = { ...structuredClone(imported), source: 'ibkr-connector', holdingsDate: '2026-10-20', dailyNotes: [{ date: '2026-10-12', text: 'Synthetic daily reflection', updatedAt: '2026-10-20T00:00:00Z' }], snapshots: [{ id: 'connector-nav', date: '2026-10-12', netAssetValue: 9000, cash: null, currency: 'USD' }, ...imported.snapshots] };
  seed.trades[0].notes = 'Synthetic execution reflection';
  const merged = mergeJournals(seed, imported, { now: '2026-10-20T00:00:00Z' });
  const again = mergeJournals(merged, imported, { now: '2026-10-20T00:00:00Z' });
  assert.deepEqual(merged, again);
  assert.equal(merged.trades.length, 2);
  assert.equal(merged.cashflows.length, 1);
  assert.equal(merged.trades[0].notes, seed.trades[0].notes);
  assert.equal(merged.dailyNotes[0].text, seed.dailyNotes[0].text);
  assert.equal(merged.snapshots[0].cash, null);
  assert.equal(merged.holdingsDate, '2026-10-20');
  assert.equal(merged.coverage.complete, false);
  assert.deepEqual(merged.snapshots.map((row) => row.date), ['2026-10-12', '2026-10-19']);
});

await test('All incoming and existing arrays obey the immutable publication floor, even when env requests an earlier date', () => {
  const journal = parse();
  journal.dayZero = '2020-01-01';
  journal.trades.push({ ...journal.trades[0], id: 'old-trade', executedAt: '2026-10-11T15:59:59Z' });
  journal.cashflows.push({ ...journal.cashflows[0], id: 'old-flow', date: '2026-10-11' });
  journal.snapshots.push({ id: 'old-snapshot', date: '2026-10-11', netAssetValue: 1, cash: 1, currency: 'USD' });
  journal.dailyNotes = [{ date: '2026-10-11', text: 'excluded note', updatedAt: '2026-10-12T00:00:00Z' }];
  const merged = mergeJournals(journal, journal, { dayZero: '2010-01-01' });
  assert.equal(merged.dayZero, '2026-10-12');
  assert.equal(merged.trades.length, 2);
  assert.equal(merged.cashflows.length, 1);
  assert.equal(merged.snapshots.length, 1);
  assert.equal(merged.dailyNotes.length, 0);
  assert.equal(merged.coverage.start, '2026-10-12');
  const later = mergeJournals(merged, parse(), { dayZero: '2026-10-13' });
  assert.equal(later.trades.length, 1);
  assert.equal(later.holdings.length, 0);
});

await test('Projection drops arbitrary metadata and accepts nullable cash and signed fees', () => {
  const input = parse();
  input.accountId = 'SYNTHETIC';
  input.trades[0].brokerSecret = 'never export';
  input.snapshots[0].cash = null;
  const normalized = normalizeJournal(input);
  assert.equal(normalized.accountId, undefined);
  assert.equal(normalized.trades[0].brokerSecret, undefined);
  assert.equal(normalized.snapshots[0].cash, null);
  assert.equal(normalized.trades[1].fee, -0.1);
});

await test('Option holdings publish P&L only with a matching post-Day-0 full contract', () => {
  const input = parse();
  const full = input.trades[0].instrumentLabel;
  input.holdings = [{ symbol: 'SYN', instrumentLabel: full, assetClass: 'OPT', quantity: 1, averageCost: 1.25, currency: 'USD', marketValue: 150, unrealizedPnl: 25 }];
  assert.equal(normalizeJournal(input).holdings[0].unrealizedPnl, 25);
  input.holdings[0].instrumentLabel = 'SYN 2026-10-30 CALL 100 ×100';
  const unknownContract = normalizeJournal(input).holdings[0];
  assert.equal(unknownContract.unrealizedPnl, undefined);
  assert.equal(unknownContract.marketValue, 150);
  assert.equal(unknownContract.averageCost, 1.25);
});

await test('Ordinary stocks use multiplier one and never inherit an option multiplier', () => {
  const stocks = parse(report.replaceAll('assetCategory="OPT"', 'assetCategory="STK"').replaceAll('multiplier="100"', 'multiplier="1"'));
  assert.equal(stocks.trades[0].assetClass, 'STK');
  assert.equal(stocks.trades[0].grossAmount, 2.5);
  assert.throws(() => parse(report.replaceAll('assetCategory="OPT"', 'assetCategory="STK"')), /股票合约乘数/);
});

await test('Holdings freshness uses the actual report date rather than a later requested interval end', () => {
  const changedEnd = parse(report.replace('toDate="20261019">', 'toDate="20261020">'));
  assert.equal(changedEnd.holdingsDate, '2026-10-19');
});

await test('Date batching covers leap days without overlaps and daily snapshots skip weekends', () => {
  const ranges = dateRanges('2024-01-01', '2025-01-01');
  assert.deepEqual(ranges, [{ from: '2024-01-01', to: '2024-12-30' }, { from: '2024-12-31', to: '2025-01-01' }]);
  assert.deepEqual(dateRanges('2026-10-16', '2026-10-19', { daily: true }).map((row) => row.from), ['2026-10-16', '2026-10-19']);
});

await test('Client uses only fixed GET endpoints, ignores supplied URLs and retries generation with bounded pacing', async () => {
  let time = 0;
  const calls = [], waits = [];
  const responses = [success, errorXml('1019'), report];
  const client = createFlexClient({ clock: () => time, sleep: async (ms) => { waits.push(ms); time += ms; }, fetchImpl: async (url, options) => { calls.push({ url: new URL(url), options }); return new Response(responses.shift()); } });
  assert.equal(await client.report({ ...credentials, from: '2026-10-12', to: '2026-10-19' }), report);
  assert.equal(calls.length, 3);
  assert.ok(waits.every((ms) => ms >= 6500));
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://ndcdyn.interactivebrokers.com');
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    assert.match(call.url.pathname, /\/(SendRequest|GetStatement)$/);
  }
  assert.equal(calls[0].url.searchParams.get('fd'), '20261012');
  assert.equal(calls[1].url.searchParams.get('q'), '123456');
});

await test('Terminal broker/network errors redact supplied tokens/messages and stop promptly', async () => {
  let calls = 0;
  const client = createFlexClient({ fetchImpl: async () => { calls++; return new Response(errorXml('1012', `${credentials.token} SYNTHETIC`)); } });
  await assert.rejects(client.report(credentials), (error) => error instanceof JournalImportError && /过期/.test(error.message) && !error.message.includes(credentials.token) && !error.message.includes('SYNTHETIC'));
  assert.equal(calls, 1);
  const failed = createFlexClient({ fetchImpl: async () => { throw new Error(`private url ${credentials.token}`); } });
  await assert.rejects(failed.report(credentials), (error) => !error.message.includes(credentials.token));
  let time = 0;
  let attempts = 0;
  const busy = createFlexClient({ clock: () => time, sleep: async (ms) => { time += ms; }, fetchImpl: async () => new Response(++attempts === 1 ? success : errorXml('1019')) });
  await assert.rejects(busy.report(credentials), /1019/);
  assert.equal(attempts, 6);
});

await test('Offline CLI dry-run is read-only; publishing requires opt-in; failed import preserves file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-ibkr-check-'));
  try {
    const input = join(directory, 'synthetic.xml');
    const journalPath = join(directory, 'journal.json');
    const initial = `${JSON.stringify(emptyJournal())}\n`;
    await writeFile(input, report);
    await writeFile(journalPath, initial);
    const env = { IBKR_REPORT_TIME_ZONE: 'UTC' };
    await assert.rejects(syncJournal({ args: ['--input', input], env, journalPath }), /TRADING_PUBLIC_ENABLED/);
    assert.match(await syncJournal({ args: ['--input', input, '--dry-run'], env, journalPath }), /未写入/);
    assert.equal(await readFile(journalPath, 'utf8'), initial);
    assert.match(await syncJournal({ args: ['--input', input], env: { ...env, TRADING_PUBLIC_ENABLED: 'true' }, journalPath }), /同步完成/);
    const saved = await readFile(journalPath, 'utf8');
    await writeFile(input, '<broken>');
    await assert.rejects(syncJournal({ args: ['--input', input], env: { ...env, TRADING_PUBLIC_ENABLED: 'true' }, journalPath }), /XML/);
    assert.equal(await readFile(journalPath, 'utf8'), saved);
    assert.throws(() => parseArguments(['--input', input, '--from', '2026-10-12', '--to', '2026-10-19']), /不能/);
    await assert.rejects(syncJournal({ args: ['--dry-run'], env, journalPath }), /IBKR_SYNC_ENABLED/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

await test('Multi-day backfill retains the latest holding bought in an earlier report of the same run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-ibkr-backfill-'));
  try {
    const journalPath = join(directory, 'journal.json');
    await writeFile(journalPath, JSON.stringify(emptyJournal()));
    const first = report.replace(/\s*<Trade [^\n]*ibExecID="synthetic-sell"[^\n]*\/>/, '').replaceAll('20261019', '20261012');
    const second = report.replace(/<Trades>[\s\S]*?<\/Trades>/, '<Trades/>').replaceAll('20261019', '20261013');
    const responses = [success, first, success, second];
    let time = 0;
    await syncJournal({ args: ['--from', '2026-10-12', '--to', '2026-10-13', '--daily-snapshots'], env: { TRADING_PUBLIC_ENABLED: 'true', IBKR_SYNC_ENABLED: 'true', IBKR_FLEX_TOKEN: credentials.token, IBKR_ACTIVITY_QUERY_ID: credentials.queryId, IBKR_REPORT_TIME_ZONE: 'UTC' }, journalPath, clock: () => time, sleep: async (ms) => { time += ms; }, fetchImpl: async () => new Response(responses.shift()) });
    const saved = JSON.parse(await readFile(journalPath, 'utf8'));
    assert.equal(saved.holdingsDate, '2026-10-13');
    assert.equal(saved.holdings.length, 1);
    assert.equal(saved.holdings[0].symbol, 'SYN');
    assert.equal(saved.trades.length, 1);
    assert.equal(saved.cashflows.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
