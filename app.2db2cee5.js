(function () {
  if (window.top !== window.self) { document.body.textContent = ''; return; }
  document.documentElement.style.visibility = 'visible';

  var URL_OK = /^https:\/\/script\.google\.com\/(?:a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/;
  var HASH = {};
  String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
    var i = kv.indexOf('=');
    if (i > 0) { try { HASH[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 무시 */ } }
  });
  var API = { url: '' };
  (function () {
    var u = HASH.u || '';
    if (!u) { try { u = window.sessionStorage.getItem('kta_u') || ''; } catch (e) { u = ''; } }
    if (URL_OK.test(u)) API.url = u;
  })();
  var NS = API.url ? API.url.replace(/^.*\/s\/([\w-]+)\/exec$/, '$1').slice(-12) : 'none';

  // 인라인 style 속성은 CSP가 막으므로 data-st를 CSSOM으로 적용(스타일 시트와 같은 우선순위: 인라인과 동일)
  Array.prototype.forEach.call(document.querySelectorAll('[data-st]'), function (n) {
    String(n.getAttribute('data-st')).split(';').forEach(function (d) {
      var i = d.indexOf(':'); if (i > 0) n.style.setProperty(d.slice(0, i).trim(), d.slice(i + 1).trim());
    });
  });

  /*
   * KTA 보관함(D5). 시트 값은 모두 textContent로만 넣는다(HTML 문자열로 넣지 않는다: 인스타·기사 글의 스크립트 삽입 방지).
   * 조회 토큰은 URL 조각(#v=…)에서 읽어 서버 함수 인자로만 넘기고, 주소창에서는 지운다(새로 고침용으로 sessionStorage).
   * 지난 목록 캐시(localStorage): 기본 목록 최근 15건의 표시 필드만. 사진 속 글자·메모·개인 서류 항목은 넣지 않는다.
   */
  var ICONS = {
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
    box: 'M3 7h18v13H3z M3 7l2-4h14l2 4 M9 12h6',
    trash: 'M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6',
    settings: 'M4 6h16 M4 12h16 M4 18h16 M9 4v4 M15 10v4 M7 16v4',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    memo: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
    lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    photo: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6',
    back: 'M15 18l-6-6 6-6',
    filter: 'M3 5h18l-7 8v6l-4-2v-4z',
    restore: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
    up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', x: 'M6 6l12 12 M18 6L6 18'
  };
  var SOURCES = [['web', '웹 링크'], ['instagram', '인스타그램'], ['facebook', '페이스북'], ['youtube', '유튜브'], ['photo', '사진'], ['text', '텍스트']];
  var ORIGINS = [['kakao', '카톡 보관'], ['share', '휴대폰 공유']];
  var PERIODS = [['', '전체'], ['1w', '1주'], ['1m', '1개월'], ['3m', '3개월'], ['1y', '1년']];
  var STATUSES = [['review', '확인 필요'], ['cleanup', '정리 후보'], ['starred', '별표'], ['memo', '메모 있음']];
  var CACHE_KEY = 'kta_list_cache_v1:' + NS, TOKEN_KEY = 'kta_view:' + NS, RECENT_KEY = 'kta_recent_v1:' + NS;

  var S = { token: '', tab: 'list', categories: [], counts: { review: 0, cleanup: 0, trash: 0, total: 0 },
    list: { q: { category: '', status: [] }, items: [], next: null, loading: false, seq: 0 },
    search: { q: { text: '', period: '', sources: [], origins: [], status: [] }, items: [], next: null, loading: false, seq: 0 },
    draft: null, detail: null, trashDays: 30 };

  // 뒤로 가기(KTA-068): 정적 페이지 빌드만 NAV_ON을 켠다(웹앱 안 옛 화면은 그대로). 화면 전환마다 history 항목을 쌓고 popstate에서 이전 화면으로 돌린다.
  // 첫 목록 화면(기준 항목)에서의 뒤로 가기만 페이지를 떠난다. 앱이 직접 닫는 경우는 history.back()을 하되 그 popstate는 무시(ignore)한다.
  var NAV_ON = true;
  var NAV = { ignore: 0, detail: false, filter: false };
  function navPush(st) { if (!NAV_ON) return; try { history.pushState(st, '', location.pathname); } catch (e) { /* 지원 안 함 */ } }
  function navBack() { if (!NAV_ON) return; NAV.ignore++; try { history.back(); } catch (e) { NAV.ignore--; } }

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = text; return e; }
  function svg(name, size) {
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', size || 22); s.setAttribute('height', size || 22); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', ICONS[name] || ''); s.appendChild(p);
    return s;
  }
  function fillIcons(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-icon]'), function (n) {
      if (!n.firstChild) n.appendChild(svg(n.getAttribute('data-icon'), n.closest('nav') ? 24 : 20));
    });
  }
  function store(kind) { try { return kind === 's' ? window.sessionStorage : window.localStorage; } catch (e) { return null; } }
  function sget(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function sset(kind, k, v) { try { var s = store(kind); if (s) { if (v === null) s.removeItem(k); else s.setItem(k, v); } } catch (e) { /* 저장소 없음 */ } }
  function isHttps(u) { return /^https:\/\//i.test(String(u || '')); }
  function isHttp(u) { return /^https?:\/\//i.test(String(u || '')); }

  /* ---------- 서버 호출(KTA-068): fetch POST text/plain, 쿠키 없음 ---------- */
  function rpc(fn, args) {
    if (!API.url) return Promise.reject(new Error('no_api'));
    return fetch(API.url, { method: 'POST', credentials: 'omit', redirect: 'follow', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ rpc: fn, token: S.token, args: args }) })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }
  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var tries = 0;
      (function go() {
        rpc(fn, args).then(function (res) {
          if (res && res.error === 'busy' && tries < 4) { tries++; setTimeout(go, 1500 * tries); return; }
          if (res && res.error === 'auth') { authFail(); reject(res); return; }
          resolve(res || { ok: false });
        }, function (e) { if (tries < 2) { tries++; setTimeout(go, 1200); } else reject(e); });
      })();
    });
  }
  function authFail() {
    sset('l', CACHE_KEY, null); sset('s', TOKEN_KEY, null);
    $('list').textContent = ''; $('auth').textContent = '휴대폰 연결을 다시 해 주세요.'; $('auth').classList.remove('hidden');
    $('more').classList.add('hidden'); S.token = '';
  }
  function busyOr(res, msg) {
    if (res && res.ok) return false;
    toast(res && res.error === 'busy' ? '자동 처리 중입니다. 잠시 후 다시 해 주세요.' : (msg || '저장하지 못했습니다. 다시 해 주세요.'));
    return true;
  }

  /* ---------- 알림(되돌리기) ---------- */
  var toastTimer = null;
  function toast(msg, undo) {
    $('toast-msg').textContent = msg;
    $('toast-undo').classList.toggle('hidden', !undo);
    $('toast-undo').onclick = function () { hideToast(); if (undo) undo(); };
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 5500 : 3000);
  }
  function hideToast() { $('toast').classList.add('hidden'); }

  /* ---------- 카드 ---------- */
  function highlight(node, text, words) {
    text = String(text || '');
    if (!words || !words.length) { node.textContent = text; return node; }
    var low = text.toLowerCase(), i = 0;
    while (i < text.length) {
      var best = -1, bw = '';
      words.forEach(function (w) { var j = low.indexOf(w, i); if (j >= 0 && (best < 0 || j < best)) { best = j; bw = w; } });
      if (best < 0) { node.appendChild(document.createTextNode(text.slice(i))); break; }
      if (best > i) node.appendChild(document.createTextNode(text.slice(i, best)));
      node.appendChild(el('mark', '', text.slice(best, best + bw.length)));
      i = best + bw.length;
    }
    return node;
  }
  var thumbWanted = {};
  var lastRender = 0;
  function thumbBox(c) {
    var t = el('div', 'thumb');
    if (c.preview === 'lock') { t.appendChild(svg('lock')); t.setAttribute('aria-label', '개인 서류'); }
    else if (c.preview === 'missing') { t.classList.add('missing'); t.appendChild(svg('photo')); t.setAttribute('aria-label', '원본 없음'); }
    else if (c.preview === 'link' && isHttps(c.image)) {
      var img = el('img'); img.referrerPolicy = 'no-referrer'; img.loading = 'lazy'; img.alt = ''; img.src = c.image;
      img.onerror = function () { t.textContent = ''; t.appendChild(svg('link')); };
      t.appendChild(img);
    } else if (c.preview === 'photo') { t.appendChild(svg('photo')); t.setAttribute('data-thumb', c.id); thumbWanted[c.id] = true; }
    else t.appendChild(svg(c.sourceKey === 'text' ? 'memo' : 'link'));
    return t;
  }
  function card(c, words, opts) {
    var root = el('div', 'card'); root.setAttribute('data-id', c.id);
    root.appendChild(thumbBox(c));
    var body = el('div', 'body'); root.appendChild(body);
    body.appendChild(highlight(el('div', 'title'), c.title || '(제목 없음)', words));
    var meta = [c.category, c.source, c.origin, c.date].filter(function (x) { return x; }).join(' · ') + (c.saveCount > 1 ? ' · ' + c.saveCount + '회 저장' : '');
    if (opts && opts.trash) meta = c.daysLeft + '일 뒤 삭제 · ' + meta;
    body.appendChild(el('div', 'meta', meta));
    if (c.summary) body.appendChild(highlight(el('div', 'summary'), c.summary, words));
    var b = el('div', 'badges');
    if (c.review) b.appendChild(el('span', 'badge review', '확인 필요'));
    if (c.cleanup) b.appendChild(el('span', 'badge cleanup', '정리 후보' + (c.cleanupReason ? ' · ' + c.cleanupReason : '')));
    if (c.memo) b.appendChild(el('span', 'badge', '메모'));
    if (b.childNodes.length) body.appendChild(b);
    var act = el('div', 'actions'); root.appendChild(act);
    if (opts && opts.trash) {
      var rs = el('button', 'icon'); rs.type = 'button'; rs.setAttribute('aria-label', '되살리기'); rs.appendChild(svg('restore'));
      rs.onclick = function (ev) { ev.stopPropagation(); restore([c.id]); };
      act.appendChild(rs);
      return root;
    }
    var st = el('button', 'icon' + (c.starred ? ' on' : '')); st.type = 'button'; st.setAttribute('aria-label', '별표'); st.appendChild(svg('star'));
    st.onclick = function (ev) { ev.stopPropagation(); toggleStar(c, st); };
    var me = el('button', 'icon'); me.type = 'button'; me.setAttribute('aria-label', '메모'); me.appendChild(svg('memo'));
    me.onclick = function (ev) { ev.stopPropagation(); if (!$('detail').classList.contains('hidden') || Date.now() - lastRender < 400) return; openDetail(c.id, true); };
    var tr = el('button', 'icon'); tr.type = 'button'; tr.setAttribute('aria-label', '휴지통'); tr.appendChild(svg('trash'));
    tr.onclick = function (ev) { ev.stopPropagation(); trash([c.id]); };
    act.appendChild(st); act.appendChild(me); act.appendChild(tr);
    root.onclick = function () {
      // 상세가 열려 있거나 목록을 막 다시 그린 직후의 터치는 무시(다른 카드가 열리는 것 방지, KTA-047)
      if (!$('detail').classList.contains('hidden') || Date.now() - lastRender < 400) return;
      openDetail(c.id, false);
    };
    return root;
  }
  function skeleton(n) {
    var f = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var c = el('div', 'card skeleton'); c.appendChild(el('div', 'thumb'));
      var b = el('div', 'body'); [70, 40, 90, 80].forEach(function (w) { var x = el('div', 'bar'); x.style.width = w + '%'; b.appendChild(x); });
      c.appendChild(b); f.appendChild(c);
    }
    return f;
  }
  function loadThumbs() {
    var ids = Object.keys(thumbWanted); thumbWanted = {};
    if (!ids.length || !S.token) return;
    call('viewThumbs', ids, 'card').then(function (res) {
      Object.keys((res && res.thumbs) || {}).forEach(function (id) {
        var uri = res.thumbs[id];
        if (!/^data:image\/[a-z+.-]+;base64,/i.test(uri)) return;
        Array.prototype.forEach.call(document.querySelectorAll('[data-thumb="' + id.replace(/[^\w-]/g, '') + '"]'), function (t) {
          t.textContent = ''; var img = el('img'); img.alt = ''; img.src = uri; t.appendChild(img);
        });
      });
    }).catch(function () {});
  }

  /* ---------- ① 보관함 ---------- */
  function renderChips() {
    var cats = $('cats'); cats.textContent = '';
    ['', ].concat(S.categories).forEach(function (c) {
      var b = el('button', 'chip' + (S.list.q.category === c ? ' on' : ''), c || '전체'); b.type = 'button';
      b.onclick = function () { S.list.q.category = c; renderChips(); reloadList(); };
      cats.appendChild(b);
    });
    var st = $('states'); st.textContent = '';
    [['review', '확인 필요 ' + S.counts.review], ['cleanup', '정리 후보 ' + S.counts.cleanup]].forEach(function (x) {
      var on = S.list.q.status.indexOf(x[0]) >= 0;
      var b = el('button', 'chip ' + x[0] + (on ? ' on' : ''), x[1]); b.type = 'button';
      b.onclick = function () { S.list.q.status = on ? [] : [x[0]]; renderChips(); reloadList(); };
      st.appendChild(b);
    });
    var cleanupOn = S.list.q.status.indexOf('cleanup') >= 0;
    $('bulk').classList.toggle('hidden', !cleanupOn || !S.counts.cleanup);
    $('bulk-trash').textContent = S.counts.cleanup + '건 모두 휴지통';
  }
  function isDefaultList() { return !S.list.q.category && !S.list.q.status.length; }
  function renderList(append) {
    var box = $('list');
    if (!append) box.textContent = '';
    var from = append ? box.querySelectorAll('.card').length : 0;
    S.list.items.slice(from).forEach(function (c) { box.appendChild(card(c)); });
    if (!S.list.items.length) box.appendChild(el('div', 'empty', '항목이 없습니다.'));
    if (!append) lastRender = Date.now();
    $('list-info').textContent = '항목 ' + (S.list.total !== undefined ? S.list.total : S.list.items.length) + '건';
    $('more').classList.toggle('hidden', S.list.next === null || S.list.next === undefined);
    loadThumbs();
  }
  function saveCache() {
    if (!isDefaultList()) return;
    var items = S.list.items.filter(function (c) { return !c.personal; }).slice(0, 15).map(function (c) {
      return { id: c.id, title: c.title, category: c.category, source: c.source, sourceKey: c.sourceKey, origin: c.origin, date: c.date, summary: c.summary,
        saveCount: c.saveCount, preview: c.preview === 'photo' ? 'photo' : c.preview === 'link' ? 'link' : c.preview === 'missing' ? 'missing' : 'none',
        image: c.preview === 'link' ? c.image : '' };
    });
    sset('l', CACHE_KEY, JSON.stringify({ at: Date.now(), categories: S.categories, items: items }));
  }
  function showCache() {
    var raw = sget('l', CACHE_KEY);
    if (!raw) return false;
    try {
      var c = JSON.parse(raw);
      S.categories = (c.categories || []).map(String);
      S.list.items = (c.items || []).map(function (x) {
        return { id: String(x.id), title: String(x.title || ''), category: String(x.category || ''), source: String(x.source || ''),
          sourceKey: String(x.sourceKey || ''), origin: String(x.origin || ''), date: String(x.date || ''), summary: String(x.summary || ''), saveCount: Number(x.saveCount) || 1,
          preview: String(x.preview || 'none'), image: String(x.image || '') };
      });
      S.list.next = null; renderChips(); renderList(false); $('list-info').textContent = '최근 항목';
      return true;
    } catch (e) { return false; }
  }
  function reloadList() {
    var seq = ++S.list.seq;
    S.list.loading = true;
    $('list').textContent = ''; $('list').appendChild(skeleton(3));
    call('viewList', S.list.q, 0).then(function (res) {
      if (seq !== S.list.seq) return;
      S.list.loading = false;
      if (!res.ok) { $('list').textContent = ''; $('list').appendChild(el('div', 'empty', '불러오지 못했습니다. 아래로 당겨 다시 열어 주세요.')); return; }
      S.list.items = res.items; S.list.next = res.next; S.list.total = res.total; S.counts = res.counts || S.counts;
      renderChips(); renderList(false); saveCache();
    }).catch(function () { S.list.loading = false; });
  }
  function loadMore(which) {
    var L = S[which];
    if (L.loading || L.next === null || L.next === undefined || !S.token) return;
    L.loading = true;
    var seq = L.seq;
    call('viewList', L.q, L.next).then(function (res) {
      L.loading = false;
      if (seq !== L.seq || !res.ok) return;
      L.items = L.items.concat(res.items); L.next = res.next; L.total = res.total;
      if (which === 'list') renderList(true); else renderResults(true);
    }).catch(function () { L.loading = false; });
  }

  function toggleStar(c, btn) {
    var want = !c.starred;
    c.starred = want; btn.classList.toggle('on', want);
    call('viewUpdate', c.id, { starred: want }, expectOf(c)).then(function (res) { if (busyOr(res)) { c.starred = !want; btn.classList.toggle('on', !want); } });
  }
  function removeCards(ids) {
    var set = {}; ids.forEach(function (i) { set[i] = true; });
    ['list', 'search'].forEach(function (k) { S[k].items = S[k].items.filter(function (c) { return !set[c.id]; }); });
    Array.prototype.forEach.call(document.querySelectorAll('.card[data-id]'), function (n) { if (set[n.getAttribute('data-id')]) n.remove(); });
  }
  function trash(ids, afterRender) {
    if (!ids.length) return;
    call('viewTrash', ids).then(function (res) {
      if (busyOr(res, '휴지통으로 옮기지 못했습니다.')) return;
      removeCards(res.ids); S.counts = res.counts || S.counts; renderChips(); saveCache();
      toast(res.moved + '건을 휴지통으로 옮겼습니다', function () { restore(res.ids, true); });
      if (afterRender) afterRender();
    });
  }
  function restore(ids, fromUndo) {
    call('viewRestore', ids).then(function (res) {
      if (busyOr(res, '되살리지 못했습니다.')) return;
      S.counts = res.counts || S.counts;
      toast(fromUndo ? '되돌렸습니다' : res.restored + '건을 되살렸습니다');
      if (S.tab === 'trash') loadTrash(); else reloadList();
    });
  }

  /* ---------- ② 검색 ---------- */
  function words() { return String(S.search.q.text || '').toLowerCase().split(/\s+/).filter(function (w) { return w; }); }
  function hasFilter() { var q = S.search.q; return !!(q.period || q.sources.length || (q.origins || []).length || q.status.length); }
  function renderRecent() {
    var r = []; try { r = JSON.parse(sget('l', RECENT_KEY) || '[]'); } catch (e) { r = []; }
    var box = $('recent'); box.textContent = '';
    r.slice(0, 8).forEach(function (w) {
      var b = el('button', 'chip', String(w)); b.type = 'button';
      b.onclick = function () { $('q').value = String(w); runSearch(); };
      box.appendChild(b);
    });
    $('recent-box').classList.toggle('hidden', !r.length || !!S.search.q.text || hasFilter());
  }
  function rememberSearch(w) {
    if (!w) return;
    var r = []; try { r = JSON.parse(sget('l', RECENT_KEY) || '[]'); } catch (e) { r = []; }
    r = [w].concat(r.filter(function (x) { return x !== w; })).slice(0, 8);
    sset('l', RECENT_KEY, JSON.stringify(r));
  }
  function renderFilterSummary() {
    var box = $('filter-summary'); box.textContent = '';
    var q = S.search.q, labels = [];
    if (q.period) labels.push(PERIODS.filter(function (p) { return p[0] === q.period; })[0][1]);
    q.sources.forEach(function (s) { labels.push(SOURCES.filter(function (p) { return p[0] === s; })[0][1]); });
    (q.origins || []).forEach(function (s) { labels.push(ORIGINS.filter(function (p) { return p[0] === s; })[0][1]); });
    q.status.forEach(function (s) { labels.push(STATUSES.filter(function (p) { return p[0] === s; })[0][1]); });
    labels.forEach(function (l) { box.appendChild(el('span', 'chip on', l)); });
  }
  function runSearch() {
    S.search.q.text = $('q').value.trim();
    renderFilterSummary(); renderRecent();
    if (!S.search.q.text && !hasFilter()) { $('results').textContent = ''; $('search-info').textContent = ''; return; }
    rememberSearch(S.search.q.text);
    var seq = ++S.search.seq;
    S.search.loading = true;
    $('results').textContent = ''; $('results').appendChild(skeleton(2));
    call('viewList', S.search.q, 0).then(function (res) {
      if (seq !== S.search.seq) return;
      S.search.loading = false;
      if (!res.ok) { $('results').textContent = ''; return; }
      S.search.items = res.items; S.search.next = res.next; S.search.total = res.total; renderResults(false);
    }).catch(function () { S.search.loading = false; });
  }
  function renderResults(append) {
    var box = $('results');
    if (!append) box.textContent = '';
    var from = append ? box.querySelectorAll('.card').length : 0, w = words();
    S.search.items.slice(from).forEach(function (c) { box.appendChild(card(c, w)); });
    if (!S.search.items.length) box.appendChild(el('div', 'empty', '찾은 항목이 없습니다.'));
    if (!append) lastRender = Date.now();
    $('search-info').textContent = '찾은 항목 ' + S.search.total + '건';
    $('more-s').classList.toggle('hidden', S.search.next === null || S.search.next === undefined);
    loadThumbs();
  }
  function optButtons(boxId, list, isOn, onTap) {
    var box = $(boxId); box.textContent = '';
    list.forEach(function (p) {
      var b = el('button', 'chip' + (isOn(p[0]) ? ' on' : ''), p[1]); b.type = 'button';
      b.onclick = function () { onTap(p[0]); openFilter(true); };
      box.appendChild(b);
    });
  }
  function openFilter(keep) {
    if (!keep) S.draft = JSON.parse(JSON.stringify(S.search.q));
    var d = S.draft;
    var tog = function (arr, v) { var i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
    optButtons('f-period', PERIODS, function (v) { return d.period === v; }, function (v) { d.period = v; });
    d.origins = d.origins || [];
    optButtons('f-source', SOURCES, function (v) { return d.sources.indexOf(v) >= 0; }, function (v) { tog(d.sources, v); });
    optButtons('f-origin', ORIGINS, function (v) { return d.origins.indexOf(v) >= 0; }, function (v) { tog(d.origins, v); });
    optButtons('f-status', STATUSES, function (v) { return d.status.indexOf(v) >= 0; }, function (v) { tog(d.status, v); });
    $('sheet').classList.remove('hidden'); $('sheet-bg').classList.remove('hidden');
    if (NAV_ON && !keep && !NAV.filter) { NAV.filter = true; navPush({ k: 'filter', t: S.tab }); }
  }
  function hideFilter() { $('sheet').classList.add('hidden'); $('sheet-bg').classList.add('hidden'); }
  function closeFilter() { hideFilter(); if (NAV.filter) { NAV.filter = false; navBack(); } }

  /* ---------- ③ 상세 ---------- */
  function openDetail(id, focusMemo) {
    S.detail = { id: id };
    if (NAV_ON && !NAV.detail) { NAV.detail = true; navPush({ k: 'detail', t: S.tab }); }
    $('detail').removeAttribute('data-id'); // 이 항목 내용을 다 그린 뒤에만 표시(저장 때 대조)
    $('detail').classList.remove('hidden'); $('detail').scrollTop = 0;
    $('d-title').textContent = '불러오는 중…'; $('d-meta').textContent = ''; $('d-hero').textContent = '';
    ['d-summary', 'd-keywords', 'd-ocr', 'd-desc'].forEach(function (k) { $(k).textContent = ''; });
    $('d-memo').value = '';
    call('viewDetail', id).then(function (res) {
      if (!S.detail || S.detail.id !== id) return;
      if (!res.ok) { $('d-title').textContent = '항목을 찾을 수 없습니다.'; return; }
      var it = res.item, c = it.card;
      if (c.id !== id) return;
      S.detail.item = it;
      $('detail').setAttribute('data-id', id); S.detail.memo0 = it.memo; S.detail.cat0 = c.category;
      var hero = $('d-hero');
      if (it.personal) { var hb = el('div', 'hero-box'); hb.appendChild(svg('lock', 32)); hb.appendChild(el('span', '', ' 개인 서류 사진은 미리보기를 보여 주지 않습니다')); hero.appendChild(hb); }
      else if (it.photos) {
        var box = el('div', 'hero-box', '사진 불러오는 중…'); hero.appendChild(box);
        call('viewThumbs', [id], 'detail').then(function (r) {
          var uri = r && r.thumbs && r.thumbs[id];
          if (uri && /^data:image\/[a-z+.-]+;base64,/i.test(uri)) { box.textContent = ''; var img = el('img', 'hero'); img.alt = ''; img.src = uri; box.appendChild(img); }
          else box.textContent = '미리보기를 만들 수 없습니다';
        });
      } else if (c.preview === 'link' && isHttps(c.image)) {
        var img2 = el('img', 'hero'); img2.referrerPolicy = 'no-referrer'; img2.alt = ''; img2.src = c.image;
        img2.onerror = function () { img2.remove(); }; hero.appendChild(img2);
      }
      $('d-title').textContent = c.title || '(제목 없음)';
      $('d-meta').textContent = [c.source, c.date].filter(function (x) { return x; }).join(' · ') + (c.saveCount > 1 ? ' · ' + c.saveCount + '회 저장' : '');
      $('d-review').classList.toggle('hidden', !c.review);
      var sel = $('d-cat'); sel.textContent = '';
      var cats = res.categories.slice();
      if (c.category && cats.indexOf(c.category) < 0) cats.unshift(c.category);
      cats.forEach(function (x) { var o = el('option', '', x); o.value = x; if (x === c.category) o.selected = true; sel.appendChild(o); });
      $('d-summary').textContent = it.summary || '요약 없음';
      $('d-keywords').textContent = it.keywords ? '키워드: ' + it.keywords : '';
      $('d-summary-box').classList.toggle('hidden', it.personal);
      $('d-desc').textContent = it.description || ''; $('d-desc-box').classList.toggle('hidden', !it.description || it.type !== 'LINK');
      $('d-ocr').textContent = it.ocr || ''; $('d-ocr-box').classList.toggle('hidden', !it.ocr);
      $('d-ai-box').classList.toggle('hidden', !(it.type === 'PHOTO' && it.photos && !it.aiSent && !it.personal));
      $('d-memo').value = it.memo || '';
      var open = $('d-open'), drive = $('d-drive');
      open.classList.toggle('hidden', !isHttp(it.url)); open.href = isHttp(it.url) ? it.url : '#';
      drive.classList.toggle('hidden', !isHttps(it.driveUrl)); drive.href = isHttps(it.driveUrl) ? it.driveUrl : '#';
      if (focusMemo) setTimeout(function () { $('d-memo').focus(); }, 50);
    });
  }
  function hideDetail() { $('detail').classList.add('hidden'); S.detail = null; lastRender = Date.now(); }
  function closeDetail() { hideDetail(); if (NAV.detail) { NAV.detail = false; navBack(); } }
  // 서버가 '화면이 본 그 항목'인지 대조할 값(KTA-047)
  function expectOf(c) { return { date: c.date, sourceKey: c.sourceKey }; }
  function saveDetail() {
    var d = S.detail;
    // 저장 대상 = 지금 열린 상세 ID = 서버에서 받은 항목 ID = 화면에 그린 항목 ID(셋이 같을 때만, KTA-047)
    if (!d || !d.item || d.item.card.id !== d.id || $('detail').getAttribute('data-id') !== d.id) { closeDetail(); return; }
    var patch = {}, memo = $('d-memo').value, cat = $('d-cat').value;
    if (memo !== d.memo0) patch.memo = memo;
    if (cat !== d.cat0) patch.category = cat;
    if (!Object.keys(patch).length) { closeDetail(); return; }
    var title = d.item.card.title || '항목';
    call('viewUpdate', d.id, patch, expectOf(d.item.card)).then(function (res) {
      if (res && res.error === 'mismatch') { toast('항목이 바뀌어 저장하지 않았습니다. 목록에서 다시 열어 주세요.'); closeDetail(); reloadList(); return; }
      if (busyOr(res)) return;
      replaceCard(res.item); closeDetail(); toast("'" + title.slice(0, 20) + "'에 저장했습니다");
    });
  }
  function replaceCard(c) {
    if (!c) return;
    ['list', 'search'].forEach(function (k) { S[k].items = S[k].items.map(function (x) { return x.id === c.id ? c : x; }); });
    Array.prototype.forEach.call(document.querySelectorAll('.card[data-id]'), function (n) {
      if (n.getAttribute('data-id') === c.id) n.replaceWith(card(c, n.closest('#results') ? words() : null));
    });
    loadThumbs();
  }

  /* ---------- ④ 휴지통 ---------- */
  function loadTrash() {
    $('trash').textContent = ''; $('trash').appendChild(skeleton(2));
    call('viewTrashList').then(function (res) {
      if (!res.ok) return;
      S.trashDays = res.keepDays;
      $('title').textContent = '휴지통 ' + res.items.length;
      $('trash-note').textContent = '휴지통의 항목은 ' + res.keepDays + '일 동안 보관한 뒤 자동으로 지워집니다.';
      var box = $('trash'); box.textContent = '';
      res.items.forEach(function (c) { box.appendChild(card(c, null, { trash: true })); });
      if (!res.items.length) box.appendChild(el('div', 'empty', '휴지통이 비어 있습니다.'));
      $('empty-trash').classList.toggle('hidden', !res.items.length);
      loadThumbs();
    });
  }

  /* ---------- ⑤ 설정 ---------- */
  var catEdit = [];
  function renderCatEdit() {
    var box = $('cat-edit'); box.textContent = '';
    catEdit.forEach(function (c, i) {
      var row = el('div', 'row');
      var inp = el('input'); inp.type = 'text'; inp.value = c.name; inp.maxLength = 30; inp.disabled = c.orig === '기타';
      inp.oninput = function () { c.name = inp.value; };
      var up = el('button', 'icon'); up.type = 'button'; up.setAttribute('aria-label', '위로'); up.appendChild(svg('up'));
      up.onclick = function () { if (i > 0) { catEdit.splice(i - 1, 0, catEdit.splice(i, 1)[0]); renderCatEdit(); } };
      var dn = el('button', 'icon'); dn.type = 'button'; dn.setAttribute('aria-label', '아래로'); dn.appendChild(svg('down'));
      dn.onclick = function () { if (i < catEdit.length - 1) { catEdit.splice(i + 1, 0, catEdit.splice(i, 1)[0]); renderCatEdit(); } };
      var x = el('button', 'icon'); x.type = 'button'; x.setAttribute('aria-label', '삭제'); x.appendChild(svg('x'));
      x.disabled = c.orig === '기타'; x.style.opacity = x.disabled ? '.3' : '1';
      x.onclick = function () { if (confirm("'" + c.name + "' 카테고리를 지울까요? 이 카테고리의 항목은 '기타'로 옮겨집니다.")) { catEdit.splice(i, 1); renderCatEdit(); } };
      row.appendChild(inp); row.appendChild(up); row.appendChild(dn); row.appendChild(x);
      box.appendChild(row);
    });
  }
  function loadSettings() {
    call('viewSettings').then(function (res) {
      if (!res.ok) return;
      catEdit = res.categories.map(function (c) { return { orig: c, name: c }; }); renderCatEdit();
      S.settingsCats = res.categories.slice();
      $('sw-auto').checked = res.autoProcess; $('sw-ai').checked = res.photoAi; $('sw-mail').checked = res.briefMail;
      S.briefNext = res.briefNext; showMailNext();
      $('kw').value = res.excludeKeywords.join(', ');
      var m = $('masks'); m.textContent = ''; res.maskRules.forEach(function (n) { m.appendChild(el('span', 'chip', n)); });
    });
  }
  function saveSwitch(key, input) {
    var s = {}; s[key] = input.checked;
    call('viewSaveSettings', s).then(function (res) { if (busyOr(res)) input.checked = !input.checked; else toast('저장했습니다'); showMailNext(); });
  }
  function showMailNext() {
    var on = $('sw-mail').checked && $('sw-auto').checked;
    $('mail-next').textContent = !$('sw-mail').checked ? '꺼져 있습니다' : !on ? '자동 처리가 꺼져 있어 보내지 않습니다' : '다음 발송: ' + (S.briefNext || '');
  }

  /* ---------- 탭 ---------- */
  var TITLES = { list: '보관함', search: '검색', trash: '휴지통', settings: '설정' };
  function showTab(t) { if (NAV_ON && t !== S.tab) navPush({ k: 'tab', t: t }); applyTab(t); }
  function applyTab(t) {
    S.tab = t;
    ['list', 'search', 'trash', 'settings'].forEach(function (k) { $('tab-' + k).classList.toggle('hidden', k !== t); });
    Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    $('title').textContent = TITLES[t];
    window.scrollTo(0, 0);
    lastRender = Date.now();
    if (!S.token) return;
    if (t === 'trash') loadTrash();
    if (t === 'settings') loadSettings();
    if (t === 'search') { renderRecent(); setTimeout(function () { $('q').focus(); }, 50); }
  }

  window.addEventListener('popstate', function (e) {
    if (!NAV_ON) return;
    if (NAV.ignore > 0) { NAV.ignore--; return; }
    var st = e.state || { k: 'tab', t: 'list' };
    if (st.k !== 'detail' && NAV.detail) { NAV.detail = false; hideDetail(); }
    if (st.k !== 'filter' && NAV.filter) { NAV.filter = false; hideFilter(); }
    if (st.k !== 'detail' && st.k !== 'filter' && S.tab !== (st.t || 'list')) applyTab(st.t || 'list');
  });

  /* ---------- 시작: 화면 틀 즉시 → 지난 목록 → 새 데이터 ---------- */
  fillIcons();
  renderChips();
  var hadCache = showCache();
  if (!hadCache) { $('list').appendChild(skeleton(4)); }

  Array.prototype.forEach.call(document.querySelectorAll('nav button'), function (b) { b.onclick = function () { showTab(b.getAttribute('data-tab')); }; });
  $('fake-search').onclick = function () { showTab('search'); };
  $('q').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); $('q').blur(); runSearch(); } };
  $('q').onsearch = runSearch;
  $('open-filter').onclick = function () { openFilter(false); };
  $('sheet-bg').onclick = closeFilter;
  $('f-reset').onclick = function () { S.draft = { text: S.search.q.text, period: '', sources: [], origins: [], status: [] }; openFilter(true); };
  $('f-apply').onclick = function () { S.search.q = S.draft; S.search.q.text = $('q').value.trim(); closeFilter(); runSearch(); };
  $('bulk-trash').onclick = function () {
    // 아직 안 불러온 후보까지 서버가 조건으로 한 번에 옮긴다(되돌리기는 옮긴 ID 그대로)
    call('viewTrashQuery', { status: ['cleanup'] }).then(function (res) {
      if (busyOr(res, '휴지통으로 옮기지 못했습니다.')) return;
      S.counts = res.counts || S.counts; S.list.q.status = []; renderChips(); reloadList();
      toast(res.moved + '건을 휴지통으로 옮겼습니다', function () { restore(res.ids, true); });
    });
  };
  $('d-back').onclick = closeDetail;
  $('d-save').onclick = saveDetail;
  $('d-trash').onclick = function () { var id = S.detail && S.detail.id; closeDetail(); if (id) trash([id]); };
  $('d-reviewed').onclick = function () {
    var id = S.detail && S.detail.id;
    if (!S.detail || !S.detail.item || S.detail.item.card.id !== id) return;
    call('viewUpdate', id, { reviewed: true }, expectOf(S.detail.item.card)).then(function (res) {
      if (busyOr(res)) return;
      $('d-review').classList.add('hidden'); replaceCard(res.item); S.counts.review = Math.max(0, S.counts.review - 1); renderChips(); toast('확인했습니다');
    });
  };
  $('d-ai').onclick = function () {
    var id = S.detail && S.detail.id;
    if (!confirm('이 사진을 AI로 보내 분석합니다. AI로 보내지 않을 키워드가 있는 묶음은 보내지 않습니다. 진행할까요?')) return;
    $('d-ai').disabled = true; $('d-ai').textContent = '분석 중…';
    call('viewPhotoAi', id).then(function (res) {
      $('d-ai').disabled = false; $('d-ai').textContent = '이 사진만 AI 분석 요청';
      if (busyOr(res, '분석하지 못했습니다.')) return;
      toast(res.excluded ? 'AI로 보내지 않을 키워드가 있어 보내지 않았습니다' : res.sent ? '분석했습니다' : '분석하지 못했습니다');
      if (res.sent) openDetail(id, false);
    });
  };
  $('empty-trash').onclick = function () {
    if (!confirm('휴지통의 항목을 모두 지웁니다. 되돌릴 수 없습니다. 진행할까요?')) return;
    call('viewEmptyTrash').then(function (res) { if (busyOr(res, '비우지 못했습니다.')) return; toast(res.items + '건을 지웠습니다'); loadTrash(); });
  };
  function addPendingCategory() {
    var v = $('cat-new').value.trim();
    $('cat-new').value = '';
    if (!v || catEdit.some(function (c) { return c.name.trim() === v; })) return false;
    var at = catEdit.findIndex(function (c) { return c.orig === '기타'; });
    catEdit.splice(at < 0 ? catEdit.length : at, 0, { orig: '', name: v });
    renderCatEdit();
    return true;
  }
  $('cat-add').onclick = addPendingCategory;
  $('cat-new').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addPendingCategory(); } };
  $('cat-save').onclick = function () {
    // '추가'를 누르지 않고 저장해도 칸에 적은 이름을 넣는다(KTA-048)
    addPendingCategory();
    var before = (S.settingsCats || []).slice();
    var list = catEdit.map(function (c) { return c.name.trim(); }).filter(function (x) { return x; });
    var renames = {}; catEdit.forEach(function (c) { if (c.orig && c.name.trim() && c.name.trim() !== c.orig) renames[c.orig] = c.name.trim(); });
    var btn = $('cat-save'); btn.disabled = true; btn.textContent = '저장 중…';
    call('viewSaveCategories', list, renames).then(function (res) {
      btn.disabled = false; btn.textContent = '카테고리 저장';
      if (busyOr(res)) return;
      S.categories = res.categories; S.settingsCats = res.categories.slice(); renderChips();
      catEdit = res.categories.map(function (c) { return { orig: c, name: c }; }); renderCatEdit();
      var added = res.categories.filter(function (c) { return before.indexOf(c) < 0 && !Object.keys(renames).some(function (k) { return renames[k] === c; }); }).length;
      var removed = before.filter(function (c) { return res.categories.indexOf(c) < 0 && !renames[c]; }).length;
      var parts = [];
      if (added) parts.push('추가 ' + added);
      if (Object.keys(renames).length) parts.push('이름 변경 ' + Object.keys(renames).length);
      if (removed) parts.push('삭제 ' + removed);
      toast('카테고리를 저장했습니다' + (parts.length ? ' · ' + parts.join(' · ') : ' · 바뀐 것 없음') + (res.changed ? ' · 항목 ' + res.changed + '건 옮김' : ''));
    }).catch(function () { btn.disabled = false; btn.textContent = '카테고리 저장'; toast('저장하지 못했습니다. 다시 해 주세요.'); });
  };
  $('sw-auto').onchange = function () { saveSwitch('autoProcess', $('sw-auto')); };
  $('sw-ai').onchange = function () { saveSwitch('photoAi', $('sw-ai')); };
  $('sw-mail').onchange = function () { saveSwitch('briefMail', $('sw-mail')); };
  $('mail-test').onclick = function () {
    var btn = $('mail-test'); btn.disabled = true; btn.textContent = '보내는 중…';
    var done = function () { btn.disabled = false; btn.textContent = '지금 시험 메일 보내기'; };
    call('viewBriefTest').then(function (res) {
      done();
      if (res && res.error === 'rate') { toast('방금 보냈습니다. 1분 뒤에 다시 해 주세요.'); return; }
      if (busyOr(res, '보내지 못했습니다. 다시 해 주세요.')) return;
      toast('시험 메일을 Gmail로 보냈습니다 · 새 항목 ' + res.items + '건');
    }).catch(function () { done(); toast('보내지 못했습니다. 다시 해 주세요.'); });
  };
  $('kw-save').onclick = function () {
    call('viewSaveSettings', { excludeKeywords: $('kw').value.split(/[,\n]/) }).then(function (res) { if (!busyOr(res)) { toast('키워드를 저장했습니다'); loadSettings(); } });
  };
  $('reconnect').onclick = function () {
    if (!confirm('연결 정보를 새로 만들고 연결 파일을 Gmail로 보냅니다. 지금 연결은 바로 끊깁니다. 진행할까요?')) return;
    call('viewReconnect').then(function (res) {
      if (busyOr(res, '보내지 못했습니다.')) return;
      sset('l', CACHE_KEY, null); sset('s', TOKEN_KEY, null);
      toast('새 연결 파일을 Gmail로 보냈습니다. 휴대폰에서 가져와 주세요.');
      S.token = '';
    });
  };
  // KTA-061 AI 정리 켜기(키 없이 설치한 경우)
  var AI_ERR = { empty: '키를 붙여 넣어 주세요.', invalid: '키가 맞지 않습니다. 키 옆 복사 버튼으로 다시 복사해 주세요.',
    permission: '이 키로는 Gemini를 쓸 권한이 없습니다. 새 키를 만들어 주세요.', billing: '결제 설정이 필요한 프로젝트의 키입니다. 결제 정보 없는 프로젝트에서 새 키를 만들어 주세요.',
    quota: '요청이 많아 잠시 막혔습니다. 1분 뒤 다시 해 주세요.', network: 'Google에 연결하지 못했습니다. 잠시 뒤 다시 해 주세요.' };
  function renderAi(ai) {
    var off = ai && !ai.on;
    $('ai-bar').classList.toggle('hidden', !off);
    if (!off) $('ai-form').classList.add('hidden');
    if (off) $('ai-wait').textContent = ai.wait ? 'AI 정리를 기다리는 항목 ' + ai.wait + '건 · 무료 키 1분' : '무료 키 1분이면 됩니다';
  }
  $('ai-open').onclick = function () { $('ai-form').classList.toggle('hidden'); };
  $('ai-save').onclick = function () {
    var b = $('ai-save'); b.disabled = true; $('ai-msg').textContent = '확인하는 중…';
    call('viewSaveKey', $('ai-key').value).then(function (res) {
      b.disabled = false; $('ai-key').value = '';
      if (!res.ok) { $('ai-msg').textContent = AI_ERR[res.error] || '저장하지 못했습니다. 다시 해 주세요.'; return; }
      $('ai-msg').textContent = '';
      renderAi({ on: true });
      toast(res.wait ? 'AI 정리를 켰습니다 · 5분 안에 ' + res.wait + '묶음을 다시 정리합니다' : 'AI 정리를 켰습니다');
    }).catch(function () { b.disabled = false; $('ai-msg').textContent = '저장하지 못했습니다. 다시 해 주세요.'; });
  };
  // 스크롤 끝에서 이어 불러오기
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) loadMore(e.target.id === 'more' ? 'list' : 'search'); });
    }, { rootMargin: '400px' });
    io.observe($('more')); io.observe($('more-s'));
  }

  (function () {
    var p = HASH;
    S.token = API.url ? (p.v || sget('s', TOKEN_KEY) || '') : '';
    if (p.v) sset('s', TOKEN_KEY, p.v);
    if (p.u && API.url) { try { window.sessionStorage.setItem('kta_u', API.url); } catch (e) { /* 저장소 없음 */ } }
    try { history.replaceState({ k: 'tab', t: 'list' }, '', location.pathname); } catch (e) { /* 지원 안 함 */ }
    // 연결 정보 없이 웹앱 주소만 연 경우(처음 설정 4단계): 데이터 없이 연결 안내만
    if (!S.token) { authFail(); $('auth').textContent = '휴대폰의 \'보관함 열기\'로 열어 주세요(주소만으로는 열리지 않습니다).'; return; }
    var seq = ++S.list.seq;
    S.list.loading = true;
    call('viewInit', S.list.q).then(function (res) {
      if (seq !== S.list.seq) return;
      S.list.loading = false;
      if (!res.ok) { if (!hadCache) { $('list').textContent = ''; $('list').appendChild(el('div', 'empty', '불러오지 못했습니다. 잠시 후 다시 열어 주세요.')); } return; }
      S.categories = res.categories; S.counts = res.counts; S.trashDays = res.trashDays;
      renderAi(res.ai);
      S.list.items = res.items; S.list.next = res.next; S.list.total = res.total;
      renderChips(); renderList(false); saveCache();
    }).catch(function () { S.list.loading = false; });
  })();

})();
