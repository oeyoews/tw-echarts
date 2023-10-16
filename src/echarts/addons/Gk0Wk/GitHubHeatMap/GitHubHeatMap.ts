import type { SourceIterator } from 'tiddlywiki';
import { IScriptAddon } from '../../../scriptAddon';
import * as ECharts from '$:/plugins/Gk0Wk/echarts/echarts.min.js';

// TODO: add click
const getFilterByDate = (date: string) =>
  `[sameday:created[${date}]] [sameday:modified[${date}]]`;
const yearDates: Map<number, [string, string][]> = new Map();
const dayTime = 3600 * 24 * 1000;
const getData = (year: number, tiddlerSourceIterator: SourceIterator) => {
  if (!yearDates.has(year)) {
    const startDate = (ECharts as any).number
      .parseDate(`${year}-01-01`)
      .getTime();
    const endDate = (ECharts as any).number
      .parseDate(`${year + 1}-01-01`)
      .getTime();
    const dates: [string, string][] = [];
    for (let time = startDate; time < endDate; time += dayTime) {
      const timeFmt: string = (ECharts as any).format.formatTime(
        'yyyy-MM-dd',
        time,
      );
      const timeTW = timeFmt.replace(/-/g, '');
      dates.push([timeFmt, timeTW]);
    }
    yearDates.set(year, dates);
  }
  let total = 0;
  return [
    yearDates.get(year)!.map(([timeFmt, timeTW]) => {
      const count = $tw.wiki.filterTiddlers(
        getFilterByDate(timeTW),
        undefined,
        tiddlerSourceIterator,
      ).length;
      total += count;
      return [timeFmt, count];
    }),
    total,
  ] as [[string, number][], number];
};

const getPlatteColor = (name: string) =>
  $tw.wiki.renderText(
    'text/plain',
    'text/vnd.tiddlywiki',
    `<$transclude tiddler={{$:/palette}} index="${name}"><$transclude tiddler="$:/palettes/Vanilla" index="${name}"><$transclude tiddler="$:/config/DefaultColourMappings/${name}"/></$transclude></$transclude>`,
    {},
  );

const checkIfChinese = () =>
  $tw.wiki.getTiddlerText('$:/language')?.includes('zh') === true;

const checkIfDarkMode = () =>
  $tw.wiki.getTiddler($tw.wiki.getTiddlerText('$:/palette')!)?.fields?.[
    'color-scheme'
  ] === 'dark';

const GitHubHeatMapAddon: IScriptAddon<any> = {
  shouldUpdate: (_, changedTiddlers) => {
    const filteredChangedTiddlers = Object.keys(changedTiddlers).filter(
      title => !(title.startsWith('$:/') || title.startsWith('Draft of')),
    );
    return filteredChangedTiddlers.length ? true : false;
  },
  onUpdate: (myChart, _state, addonAttributes) => {
    const year = parseInt(addonAttributes.year, 10) || new Date().getFullYear();
    const subfilter =
      addonAttributes.subfilter || '[all[tiddlers]!is[shadow]!is[system]]';
    /** Use subfilter to narrow down tiddler pool before the array.map on dates */
    const tiddlerSourceIterator = ($tw.wiki as any).makeTiddlerIterator(
      $tw.wiki.filterTiddlers(subfilter),
    );
    const [data, total] = getData(year, tiddlerSourceIterator);
    const tooltipFormatter = (dateValue: string, count: number) => {
      if (count === 0) {
        return checkIfChinese()
          ? `${(ECharts as any).format.formatTime(
              'yyyy年M月d日',
              dateValue,
            )} 无条目。`
          : `${$tw.utils.formatDateString(
              $tw.utils.parseDate(dateValue.replace(/-/g, ''))!,
              'MMM DDD, YYYY',
            )} no tiddler.`;
      }
      const p = $tw.utils.domMaker('p', {
        text: checkIfChinese()
          ? `${(ECharts as any).format.formatTime(
              'yyyy年M月d日',
              dateValue,
            )} 共有 ${count} 篇:`
          : `${$tw.utils.formatDateString(
              $tw.utils.parseDate(dateValue.replace(/-/g, ''))!,
              'MMM DDD, YYYY',
            )} ${count} tiddler${count > 1 ? 's' : ''}.`,
      });
      const ul = $tw.utils.domMaker('ul', {});
      const tiddlers = $tw.wiki.filterTiddlers(
        getFilterByDate(dateValue.replace(/-/g, '')),
        undefined,
        tiddlerSourceIterator,
      );
      const len = tiddlers.length;
      for (let i = 0; i < len; i++) {
        const tiddler = tiddlers[i];
        const li = $tw.utils.domMaker('li', {});
        const a = $tw.utils.domMaker('a', {
          text: tiddler,
          class:
            'tc-tiddlylink tc-tiddlylink-resolves tc-popup-handle tc-popup-absolute',
          style: {
            cursor: 'pointer',
          },
        });
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        a.addEventListener('click', () =>
          new $tw.Story().navigateTiddler(tiddler),
        );
        li.appendChild(a);
        ul.appendChild(li);
      }
      return [p, ul];
    };
    let lastDateValue = '';
    let lastCount = 0;
    let cache: Element[] | string | undefined;
    const cachedTooltipFormatter = ({
      value: [dateValue, count],
    }: {
      value: [string, number];
    }) => {
      if (dateValue !== lastDateValue || count !== lastCount || !cache) {
        cache = tooltipFormatter(dateValue, count);
        lastDateValue = dateValue;
        lastCount = count;
      }
      return cache;
    };
    // const darkMode = checkIfDarkMode();
    const darkMode =
      $tw.wiki.getTiddlerText('$:/info/darkmode') === 'yes' ? true : false;
    const chinese = checkIfChinese();
    myChart.setOption({
      title: {
        top: 0,
        left: 'center',
        text: chinese
          ? `今年产出 ${total} 篇文章`
          : `Produced ${total} tiddlers this year`,
      },
      tooltip: {
        // position: 'top',
        // formatter: cachedTooltipFormatter,
        formatter: (params: any) => {
          const { value: data } = params;
          const [date, count] = data;
          return count ? `${date} 新增了 ${count} 个条目` : `无新增条目`;
        },
        triggerOn: 'mousemove|click',
        enterable: true,
        hideDelay: 800,
        backgroundColor: darkMode
          ? '#282828'
          : getPlatteColor('page-background'),
        // borderColor: getPlatteColor('very-muted-foreground'),
        borderWidth: 0,
      },
      visualMap: {
        type: 'piecewise',
        orient: 'horizontal',
        calculable: true,
        showLabel: false,
        right: 0,
        top: 175,
        pieces: [
          // 设置分段范围
          { lte: 0, color: darkMode ? '#161B22' : '#EBEDF0' },
          { gt: 0, lte: 3, color: darkMode ? '#0E4429' : '#39D353' },
          { gt: 3, lte: 7, color: darkMode ? '#006D32' : '#26A641' },
          { gt: 7, lte: 15, color: darkMode ? '#26A641' : '#006D32' },
          { gt: 15, color: darkMode ? '#39D353' : '#0E4429' },
        ],
      },
      calendar: {
        top: 60,
        left: 0,
        right: 0,
        cellSize: 15,
        orient: 'horizontal',
        range: year,
        itemStyle: {
          borderWidth: 3,
          borderCap: 'round',
          borderJoin: 'round',
          borderColor: getPlatteColor('background'),
          // borderColor: 'transparent',
        },
        splitLine: {
          show: false,
        },
        dayLabel: {
          show: true,
          nameMap: chinese ? 'ZH' : 'EN',
        },
        monthLabel: {
          show: true,
          nameMap: chinese ? 'ZH' : 'EN',
        },
        yearLabel: {
          show: true,
          position: 'bottom',
          margin: 12,
          verticalAlign: 'top',
        },
      },
      series: {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        calendarIndex: 0,
        data,
        itemStyle: { borderRadius: 3 },
      },
    } as any);
  },
};

export default GitHubHeatMapAddon;
