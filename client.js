/**
 * Sidebar session counts.
 *
 * Draws two decorations the shipped UI does not allocate a seat for:
 *   - one count per Workspace (folder) row, right after its title;
 *   - one total next to the "Workspaces" section label.
 *
 * Counts follow the archived filter the shipped browser persists under
 * `dsh.workspace.view.v5` (`default` | `show` | `only`). Each badge reads
 * `shown/total`: `shown` is what the current filter lets the user see, `total`
 * is every conversation the Workspace holds, archived included. Blank rows and
 * subagent children are not conversations and count for neither.
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

    /** `shown/total`; the two are equal whenever nothing is filtered out. */
    function label(part) {
      return String(part.shown) + '/' + String(part.total);
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
      const headerLabel = header === null ? null : header.querySelector(LABEL_SELECTOR);
      if (headerLabel === null) return;
      const text = String(shownTotal) + '/' + String(grandTotal);
      if (headerLabel.getAttribute('data-dsh-total') !== text) headerLabel.setAttribute('data-dsh-total', text);
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
