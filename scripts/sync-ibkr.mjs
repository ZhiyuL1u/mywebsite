#!/usr/bin/env node
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createFlexClient, dateRanges, emptyJournal, isoDate, JournalImportError, mergeJournals, normalizeJournal, parseActivityReport } from './lib/ibkr-flex.mjs';

const JOURNAL_PATH = fileURLToPath(new URL('../public/trading-data.json', import.meta.url));

export function parseArguments(args) {
  const options = { input: null, dryRun: false, from: null, to: null, dailySnapshots: false, help: false };
  const values = { '--input': 'input', '--from': 'from', '--to': 'to' };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (values[arg]) {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new JournalImportError('参数缺少值；运行 --help 查看用法。');
      options[values[arg]] = args[++index];
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--daily-snapshots') options.dailySnapshots = true;
    else if (arg === '--help') options.help = true;
    else throw new JournalImportError('存在不支持的参数；运行 --help 查看用法。');
  }
  if (Boolean(options.from) !== Boolean(options.to)) throw new JournalImportError('--from 与 --to 必须一起填写。');
  if (options.input && (options.from || options.dailySnapshots)) throw new JournalImportError('--input 使用文件中的日期，不能与日期回补参数同时使用。');
  if (options.dailySnapshots && !options.from) throw new JournalImportError('--daily-snapshots 需要 --from 和 --to。');
  return options;
}

export async function syncJournal({ args = process.argv.slice(2), env = process.env, journalPath = JOURNAL_PATH, fetchImpl, sleep, clock } = {}) {
  const options = parseArguments(args);
  if (options.help) {
    return '用法：node scripts/sync-ibkr.mjs [--input /本机/Flex.xml] [--dry-run]\n在线回补：[--from YYYY-MM-DD --to YYYY-MM-DD] [--daily-snapshots]\n写入公开文件必须设置 TRADING_PUBLIC_ENABLED=true。密钥只从环境变量读取。';
  }
  if (!options.dryRun && env.TRADING_PUBLIC_ENABLED !== 'true') throw new JournalImportError('尚未允许公开交易数据。确认 public/trading-data.json 会随网站和 Git 历史公开后，显式设置 TRADING_PUBLIC_ENABLED=true；只检查可使用 --dry-run。');
  const dayZero = env.TRADING_DAY_ZERO ? isoDate(env.TRADING_DAY_ZERO, 'TRADING_DAY_ZERO') : undefined;
  let existing;
  try { existing = JSON.parse(await readFile(journalPath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') existing = emptyJournal(env.TRADING_BASE_CURRENCY || 'USD');
    else throw new JournalImportError('无法读取本地 trading-data.json；没有修改账本。');
  }
  existing = normalizeJournal(existing);
  const reports = [];
  let unavailableDays = 0;
  const buys = existing.trades.filter((row) => row.side === 'BUY');
  const parseOptions = { baseCurrency: env.TRADING_BASE_CURRENCY || existing.baseCurrency, reportTimeZone: env.IBKR_REPORT_TIME_ZONE, dayZero: dayZero && dayZero > existing.dayZero ? dayZero : existing.dayZero, eligibleSymbols: buys.map((row) => row.symbol), eligibleInstruments: buys.map((row) => row.instrumentLabel).filter(Boolean) };
  if (options.input) {
    let xml;
    try { xml = await readFile(resolve(options.input), 'utf8'); }
    catch { throw new JournalImportError('无法读取本机 Flex XML 文件；请核对 --input 路径。'); }
    reports.push(parseActivityReport(xml, parseOptions));
  } else {
    if (env.IBKR_SYNC_ENABLED !== 'true') throw new JournalImportError('在线同步尚未启用；请显式设置 IBKR_SYNC_ENABLED=true。');
    const client = createFlexClient({ fetchImpl, sleep, clock });
    const ranges = options.from ? dateRanges(options.from, options.to, { daily: options.dailySnapshots }) : [{}];
    for (const range of ranges) {
      try {
        const xml = await client.report({ token: env.IBKR_FLEX_TOKEN, queryId: env.IBKR_ACTIVITY_QUERY_ID, ...range });
        const report = parseActivityReport(xml, parseOptions);
        reports.push(report);
        for (const trade of report.trades.filter((row) => row.side === 'BUY')) {
          parseOptions.eligibleSymbols.push(trade.symbol);
          if (trade.instrumentLabel) parseOptions.eligibleInstruments.push(trade.instrumentLabel);
        }
      } catch (error) {
        if (options.dailySnapshots && error instanceof JournalImportError && error.code === '1003') unavailableDays++;
        else throw error;
      }
    }
  }
  if (!reports.length) throw new JournalImportError('所选日期没有可导入的报表；未修改账本。');
  let merged = existing;
  const now = new Date().toISOString();
  for (const report of reports) merged = mergeJournals(merged, report, { dayZero, now });
  if (!options.dryRun) {
    const temporary = `${journalPath}.tmp-${process.pid}`;
    try {
      await writeFile(temporary, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o644, flag: 'wx' });
      await rename(temporary, journalPath);
    } catch { throw new JournalImportError('无法安全写入 trading-data.json；请核对文件权限后重试。'); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  return `${options.dryRun ? '检查通过（未写入）' : '同步完成'}：${merged.trades.length} 笔成交，${merged.cashflows.length} 笔入出金，${merged.snapshots.length} 个净值快照。${unavailableDays ? `另有 ${unavailableDays} 天无可用报表。` : ''}${options.dryRun ? '' : '公开数据只包含网站约定的字段。'}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  syncJournal().then((summary) => console.log(summary)).catch((error) => {
    // Never print request URLs, XML, stack traces or untrusted broker messages.
    console.error(error instanceof JournalImportError ? error.message : '同步失败；没有输出凭证或原始账户信息，请核对设置后重试。');
    process.exitCode = 1;
  });
}
