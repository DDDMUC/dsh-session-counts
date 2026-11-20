/**
 * Sidebar session counts.
 *
 * Draws two decorations the shipped UI does not allocate a seat for:
 *   - one badge per Workspace (folder) row, right after its title;
 *   - one total next to the "Workspaces" section label.
 *
 * The badge format is a plugin setting on the bundle's own row page
 * (`plugins.row.config`):
 *   - `ratio` (default): `shown/total`, where `shown` follows the archived
 *     filter persisted under `dsh.workspace.view.v5` and `total` includes
 *     archived sessions;
 *   - `visible`: the pre-0.0.2 behaviour, `shown` alone.
 * Blank rows and subagent children are not conversations and count for neither.
 *
 * Rows carry their business key in `data-row-key="workspace:<id>"`; the badge
 * rides on a `data-dsh-count` attribute rendered by CSS `::after`, so React
 * re-renders of the shipped row never remove an extra child node.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-counts',
  factory(require) {
    const React = require('react');

    const PERSIST_KEY = 'dsh.workspace.view.v5';
    const ROW_SELECTOR = '[data-row-key^="workspace:"]';
    const HEADER_SELECTOR = '[class*="_sectionHeader"]';
    const LABEL_SELECTOR = '[class*="_sectionLabel"]';
    const TOTAL_CLASS = 'dshc-total';

    /** Locale namespace and the row id this bundle's patch declares. */
    const NS = 'dsh-session-counts';
    const ROW_ID = 'session-counts';
    const MODE_KEY = 'dsh-session-counts:mode';

    /** Latest store inputs, refreshed on every render. */
    const inputs = { items: [], archivedIds: [], list: null };
    let frame = 0;
    let lastFilter = '';

    function readMode() {
      try {
        return window.localStorage.getItem(MODE_KEY) === 'visible' ? 'visible' : 'ratio';
      } catch {
        return 'ratio';
      }
    }

    let mode = readMode();
    const modeListeners = new Set();

    function setMode(next) {
      mode = next === 'visible' ? 'visible' : 'ratio';
      try {
        window.localStorage.setItem(MODE_KEY, mode);
      } catch {
        /* storage unavailable: the session keeps the in-memory choice */
      }
      for (const listener of modeListeners) {
        try {
          listener();
        } catch {
          /* one listener must not break the others */
        }
      }
      schedule();
    }

    function findFilter(value, depth) {
      if (value === null || typeof value !== 'object' || depth > 4) return undefined;
      if (typeof value.archivedFilter === 'string') return value.archivedFilter;
      for (const key of Object.keys(value)) {
        const found = findFilter(value[key], depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }

    function parse(raw) {
      if (typeof raw !== 'string' || raw === '') return undefined;
      try {
        return findFilter(JSON.parse(raw), 0);
      } catch {
        return undefined;
      }
    }

    /** The archived filter the shipped browser persists; '' when unknown. */
    function readFilter() {
      const direct = parse(window.localStorage.getItem(PERSIST_KEY));
      if (direct === 'default' || direct === 'show' || direct === 'only') return direct;
      try {
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index);
          if (key === null || !key.includes('workspace')) continue;
          const found = parse(window.localStorage.getItem(key));
          if (found === 'default' || found === 'show' || found === 'only') return found;
        }
      } catch {
        /* storage unavailable */
      }
      return '';
    }

    /**
     * One member's contribution to a folder: `total` when it is a real Session,
     * `shown` as well when the archived filter lets it through. Blank rows and
     * subagent children are not conversations and count for neither.
     */
    function weigh(session, sessionId, archived, filter) {
      if (session === undefined || session.blank === true) return null;
      if (session.origin === 'subagent') return null;
      const isArchived = archived.has(sessionId);
      const shown = filter === 'only' ? isArchived : filter === 'show' ? true : !isArchived;
      return { total: 1, shown: shown ? 1 : 0 };
    }

    function compute() {
      const filter = readFilter();
      const archived = new Set(inputs.archivedIds || []);
      const byId = (inputs.list && inputs.list.byId) || {};
      const ids = (inputs.list && inputs.list.ids) || [];
      const counts = new Map();
      let shownTotal = 0;
      let grandTotal = 0;
      const accounted = new Set();
      const tally = (sessionId) => weigh(byId[sessionId], sessionId, archived, filter);
      for (const workspace of inputs.items || []) {
        let shown = 0;
        let total = 0;
        for (const sessionId of workspace.sessionIds || []) {
          accounted.add(sessionId);
          const part = tally(sessionId);
          if (part === null) continue;
          shown += part.shown;
          total += part.total;
        }
        counts.set(workspace.workspaceId, { shown, total });
        shownTotal += shown;
        grandTotal += total;
      }
      /* The trailing Ungrouped bucket is rendered as `data-row-key="workspace:"`. */
      let strayShown = 0;
      let strayTotal = 0;
      for (const sessionId of ids) {
        if (accounted.has(sessionId)) continue;
        const part = tally(sessionId);
        if (part === null) continue;
        strayShown += part.shown;
        strayTotal += part.total;
      }
      counts.set('', { shown: strayShown, total: strayTotal });
      shownTotal += strayShown;
      grandTotal += strayTotal;
      return { filter, counts, shownTotal, grandTotal };
    }

    /** `shown/total` in ratio mode, `shown` alone in visible mode. */
    function label(part) {
      if (mode === 'visible') return String(part.shown);
      return String(part.shown) + '/' + String(part.total);
    }

    function headerLabel(shownTotal, grandTotal) {
      if (mode === 'visible') return String(shownTotal);
      return String(shownTotal) + '/' + String(grandTotal);
    }

    function paint() {
      const { filter, counts, shownTotal, grandTotal } = compute();
      lastFilter = filter;
      for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        const key = (row.getAttribute('data-row-key') || '').slice('workspace:'.length);
        const part = counts.get(key);
        if (part === undefined) row.removeAttribute('data-dsh-count');
        else {
          const text = label(part);
          if (row.getAttribute('data-dsh-count') !== text) row.setAttribute('data-dsh-count', text);
        }
      }
      /* Older generations appended a span here; drop any sibling left behind. */
      for (const stale of document.querySelectorAll('.' + TOTAL_CLASS)) stale.remove();
      const header = document.querySelector(HEADER_SELECTOR);
      const headerLabelNode = header === null ? null : header.querySelector(LABEL_SELECTOR);
      if (headerLabelNode === null) return;
      const text = headerLabel(shownTotal, grandTotal);
      if (headerLabelNode.getAttribute('data-dsh-total') !== text) {
        headerLabelNode.setAttribute('data-dsh-total', text);
      }
    }

    function schedule() {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
    }

    function SessionCounts(props) {
      const items = props.useWorkspaces === undefined ? [] : props.useWorkspaces((state) => state.items);
      const archivedIds = props.useWorkspaces === undefined ? [] : props.useWorkspaces((state) => state.archivedSessionIds);
      const list = props.useSessions === undefined ? null : props.useSessions((state) => state);
      inputs.items = items;
      inputs.archivedIds = archivedIds;
      inputs.list = list;
      React.useEffect(() => {
        schedule();
      }, [items, archivedIds, list]);
      React.useEffect(() => {
        const affectsRows = (node) => node.nodeType === 1 && (
          node.hasAttribute('data-row-key') ||
          (typeof node.querySelector === 'function' && node.querySelector('[data-row-key]') !== null)
        );
        const affectsHeader = (node) => node.nodeType === 1 && (
          (typeof node.matches === 'function' && node.matches(LABEL_SELECTOR)) ||
          (typeof node.querySelector === 'function' && node.querySelector(LABEL_SELECTOR) !== null)
        );
        const observer = new window.MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'attributes') {
              schedule();
              return;
            }
            for (const node of record.addedNodes) {
              if (affectsRows(node) || affectsHeader(node)) {
                schedule();
                return;
              }
            }
            for (const node of record.removedNodes) {
              if (affectsRows(node) || affectsHeader(node)) {
                schedule();
                return;
              }
            }
          }
        });
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-row-key'],
        });
        const timer = window.setInterval(() => {
          if (readFilter() !== lastFilter) schedule();
        }, 1000);
        schedule();
        return () => {
          observer.disconnect();
          window.clearInterval(timer);
          if (frame !== 0) window.cancelAnimationFrame(frame);
          frame = 0;
        };
      }, []);
      return null;
    }

    /** One radio row: label plus the line that explains what it shows. */
    function ModeOption(props) {
      const t = props.t;
      const value = props.value;
      const checked = props.checked;
      return React.createElement('label', {
        key: value,
        className: 'dshc-option' + (checked ? ' dshc-optionOn' : ''),
        'data-dsh-session-counts-option': value,
      }, [
        React.createElement('input', {
          key: 'input',
          type: 'radio',
          name: 'dsh-session-counts-mode',
          value,
          checked,
          onChange: () => setMode(value),
          className: 'dshc-radio',
        }),
        React.createElement('span', { key: 'body', className: 'dshc-optionBody' }, [
          React.createElement('span', { key: 'title', className: 'dshc-optionTitle' },
            t(value === 'visible' ? 'mode.visible' : 'mode.ratio')),
          React.createElement('span', { key: 'hint', className: 'dshc-optionHint' },
            t(value === 'visible' ? 'mode.visibleHint' : 'mode.ratioHint')),
        ]),
      ]);
    }

    /**
     * The bundle's own row page. `view` is `summary` for the one-liner the rows
     * list shows, `page` for the page the configure control opens.
     */
    function CountsModeCard(props) {
      const t = props.t === undefined ? (key) => key : props.t;
      const [current, setCurrent] = React.useState(mode);
      React.useEffect(() => {
        const listener = () => setCurrent(readMode());
        modeListeners.add(listener);
        return () => {
          modeListeners.delete(listener);
        };
      }, []);
      if (props.view === 'summary') {
        return React.createElement('span', null,
          t(current === 'visible' ? 'summary.visible' : 'summary.ratio'));
      }
      return React.createElement('div', { className: 'dshc-card' }, [
        React.createElement('div', { key: 'title', className: 'dshc-cardTitle' }, t('title')),
        React.createElement('div', { key: 'desc', className: 'dshc-cardDesc' }, t('desc')),
        React.createElement('div', { key: 'options', className: 'dshc-options' }, [
          React.createElement(ModeOption, { key: 'ratio', value: 'ratio', checked: current === 'ratio', t }),
          React.createElement(ModeOption, { key: 'visible', value: 'visible', checked: current === 'visible', t }),
        ]),
        React.createElement('div', { key: 'note', className: 'dshc-note' }, t('note')),
      ]);
    }

    const STYLE = [
      '[data-dsh-count]::after{content:attr(data-dsh-count);order:2;margin-inline-start:6px;flex:none;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '[data-dsh-count]>span[class*="_rowActions"]{order:3}',
      '[class*="_sectionLabel"][data-dsh-total]::after{content:attr(data-dsh-total);margin-inline-start:6px;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '[class*="_sectionLabelHidden"][data-dsh-total]::after{display:none}',
      '.dshc-card{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:12px;background:var(--dsw-alias-bg-secondary);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '.dshc-cardTitle{font-size:14px;font-weight:600;line-height:22px}',
      '.dshc-cardDesc{color:var(--dsw-alias-label-secondary)}',
      '.dshc-options{display:flex;flex-direction:column;gap:8px;margin-top:2px}',
      '.dshc-option{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid var(--dsw-alias-border-secondary);border-radius:10px;cursor:pointer}',
      '.dshc-optionOn{border-color:var(--dsw-alias-state-business-primary)}',
      '.dshc-radio{margin:3px 0 0;accent-color:var(--dsw-alias-state-business-primary)}',
      '.dshc-optionBody{display:flex;flex-direction:column;gap:2px}',
      '.dshc-optionTitle{font-weight:500}',
      '.dshc-optionHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dshc-note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
    ].join('\n');

    const ZH = {
      title: '计数显示方式',
      desc: '选择侧边栏徽章显示哪些数字。更改后立即生效。',
      'mode.ratio': '显示可见数/总数',
      'mode.ratioHint': '左边是当前可见的会话数；右边是含已归档的总数，不受筛选影响。',
      'mode.visible': '仅显示可见数',
      'mode.visibleHint': '跟随「筛选会话」，只显示当前能看到的会话数。',
      'summary.ratio': '显示可见数/总数',
      'summary.visible': '仅显示可见数',
      note: '空会话与子代理会话不计入；折叠的工作区照常统计。',
    };

    const EN = {
      title: 'Badge numbers',
      desc: 'Choose which numbers the sidebar badges show. The change applies immediately.',
      'mode.ratio': 'Visible / total',
      'mode.ratioHint': 'Left is the visible count; right includes archived sessions and ignores the filter.',
      'mode.visible': 'Visible count only',
      'mode.visibleHint': 'Follows the archived filter and shows only the sessions you can see.',
      'summary.ratio': 'Visible / total',
      'summary.visible': 'Visible count only',
      note: 'Blank and subagent sessions are not counted; collapsed Workspaces still count.',
    };

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const style = document.createElement('style');
        style.setAttribute('data-dsh-session-counts', '');
        style.textContent = STYLE;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());

        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', ZH);
          const offEn = ctx.locale.register(NS, 'en', EN);
          return () => {
            offEn();
            offZh();
          };
        }, 'session-counts: dictionaries');

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-counts',
          order: 50,
        }, SessionCounts));

        /* The manager addresses a row page by `<package name>#<row id>`; the
           package is installed under both its published and its local alias,
           so both keys point at the same card. */
        for (const bundle of ['dsh-session-counts', '@local/dsh-session-counts']) {
          ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
            name: 'plugins.row.config',
            key: bundle + '#' + ROW_ID,
            locale: NS,
          }, CountsModeCard));
        }
      },
    };
  },
});
