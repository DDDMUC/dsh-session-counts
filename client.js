/**
 * Sidebar session counts.
 *
 * Draws two decorations the shipped UI does not allocate a seat for:
 *   - one count per Workspace (folder) row, right after its title;
 *   - one total next to the "Workspaces" section label.
 *
 * Counts follow the archived filter the shipped browser persists under
 * `dsh.workspace.view.v5` (`default` | `show` | `only`) and skip blank and
 * subagent sessions, so a folder shows exactly the conversations the current
 * filter lets the user see.
 *
 * Rows carry their business key in `data-row-key="workspace:<id>"`; the count
 * rides on a `data-dsh-count` attribute rendered by CSS `::after`, so React
 * re-renders of the shipped row never remove an extra child node.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-session-counts',
  factory(require) {
    const React = require('react');

    const PERSIST_KEY = 'dsh.workspace.view.v5';
    const ROW_SELECTOR = '[data-row-key^="workspace:"]';
    const HEADER_SELECTOR = '[class*="_sectionHeader"]';
    const LABEL_SELECTOR = '[class*="_sectionLabel"]';
    const TOTAL_CLASS = 'dshc-total';

    /** Latest store inputs, refreshed on every render. */
    const inputs = { items: [], archivedIds: [], list: null };
    let frame = 0;
    let lastFilter = '';

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

    /** One Session counts unless blank, a subagent child, or hidden by the filter. */
    function visible(session, sessionId, archived, filter) {
      if (session === undefined || session.blank === true) return false;
      if (session.origin === 'subagent') return false;
      const isArchived = archived.has(sessionId);
      if (filter === 'only') return isArchived;
      if (filter === 'show') return true;
      return !isArchived;
    }

    function compute() {
      const filter = readFilter();
      const archived = new Set(inputs.archivedIds || []);
      const byId = (inputs.list && inputs.list.byId) || {};
      const ids = (inputs.list && inputs.list.ids) || [];
      const counts = new Map();
      let total = 0;
      const accounted = new Set();
      for (const workspace of inputs.items || []) {
        let count = 0;
        for (const sessionId of workspace.sessionIds || []) {
          accounted.add(sessionId);
          if (!visible(byId[sessionId], sessionId, archived, filter)) continue;
          count += 1;
        }
        counts.set(workspace.workspaceId, count);
        total += count;
      }
      /* The trailing Ungrouped bucket is rendered as `data-row-key="workspace:"`. */
      let stray = 0;
      for (const sessionId of ids) {
        if (accounted.has(sessionId)) continue;
        if (!visible(byId[sessionId], sessionId, archived, filter)) continue;
        stray += 1;
      }
      counts.set('', stray);
      total += stray;
      return { filter, counts, total };
    }

    function paint() {
      const { filter, counts, total } = compute();
      lastFilter = filter;
      for (const row of document.querySelectorAll(ROW_SELECTOR)) {
        const key = (row.getAttribute('data-row-key') || '').slice('workspace:'.length);
        const count = counts.get(key);
        if (count === undefined) row.removeAttribute('data-dsh-count');
        else if (row.getAttribute('data-dsh-count') !== String(count)) {
          row.setAttribute('data-dsh-count', String(count));
        }
      }
      /* Older generations appended a span here; drop any sibling left behind. */
      for (const stale of document.querySelectorAll('.' + TOTAL_CLASS)) stale.remove();
      const header = document.querySelector(HEADER_SELECTOR);
      const label = header === null ? null : header.querySelector(LABEL_SELECTOR);
      if (label === null) return;
      const text = String(total);
      if (label.getAttribute('data-dsh-total') !== text) label.setAttribute('data-dsh-total', text);
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

    const STYLE = [
      '[data-dsh-count]::after{content:attr(data-dsh-count);order:2;margin-inline-start:6px;flex:none;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '[data-dsh-count]>span[class*="_rowActions"]{order:3}',
      '[class*="_sectionLabel"][data-dsh-total]::after{content:attr(data-dsh-total);margin-inline-start:6px;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
      '[class*="_sectionLabelHidden"][data-dsh-total]::after{display:none}',
    ].join('\n');

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style');
        style.setAttribute('data-dsh-session-counts', '');
        style.textContent = STYLE;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'session-counts',
          order: 50,
        }, SessionCounts));
      },
    };
  },
});
