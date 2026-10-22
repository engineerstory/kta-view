// KTA-068 PoC 정적 페이지 v1: 사용자 웹앱 JSON API 호출 시험. 비밀값·외부 스크립트 없음.
// 결과는 화면에 보이고, 웹앱에는 GET 이미지 신호(plog)로 남긴다(CORS가 막혀도 요청은 닿는다).
(function () {
  var V = 'poc-v1';
  if (window.top !== window.self) { document.body.textContent = ''; return; }
  var out = document.getElementById('out'), lines = [];
  function show(k, v) { lines.push(k + ': ' + v); out.textContent = lines.join('\n'); }
  var p = {};
  String(location.hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
    var i = kv.indexOf('='); if (i > 0) { try { p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* 무시 */ } }
  });
  var URL_OK = /^https:\/\/script\.google\.com\/(?:a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/;
  var mode = String(p.m || 'none').replace(/[^\w-]/g, '').slice(0, 12);
  var t0 = Date.now();
  function snap() {
    return { w: innerWidth, h: innerHeight, sw: screen.width, sh: screen.height, dpr: Math.round(devicePixelRatio * 100) / 100,
      hr: Math.round(innerHeight / screen.height * 100) / 100, hist: history.length };
  }
  function beacon(ev, kv) {
    if (!p.u || !URL_OK.test(p.u)) return;
    kv = kv || {}; kv.ev = ev; kv.m = mode; kv.ver = V; kv.t = Date.now() - t0;
    var s = JSON.stringify(kv).slice(0, 900);
    new Image().src = p.u + '?plog=' + encodeURIComponent(s);
  }
  var s0 = snap();
  show('버전', V + ' / 모드 ' + mode);
  show('화면', s0.w + 'x' + s0.h + ' (screen ' + s0.sw + 'x' + s0.sh + ', 높이비 ' + s0.hr + ')');
  show('UA', navigator.userAgent.slice(0, 100));
  if (!p.u || !URL_OK.test(p.u)) { show('중단', '웹앱 주소(u) 형식이 아니라 아무것도 보내지 않았습니다'); return; }
  try { history.replaceState(null, '', location.pathname); show('조각 지움', 'ok'); } catch (e) { show('조각 지움', '실패'); }
  beacon('load', Object.assign({ ua: navigator.userAgent.slice(0, 160), lang: navigator.language }, s0));

  function post(body) {
    return fetch(p.u, { method: 'POST', credentials: 'omit', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); });
  }
  var a = Date.now();
  fetch(p.u + '?ping=1', { credentials: 'omit', redirect: 'follow' })
    .then(function (r) { return r.text().then(function (t) { var ok = r.status === 200 && /"ok":true/.test(t); show('GET ping', (ok ? '성공 ' : '이상 ') + r.status + ' ' + (Date.now() - a) + 'ms'); beacon('get_ping', { ok: ok ? 1 : 0, status: r.status, ms: Date.now() - a }); }); })
    .catch(function (e) { show('GET ping', '실패 ' + String(e).slice(0, 60)); beacon('get_ping', { ok: 0, err: String(e).slice(0, 80) }); })
    .then(function () { a = Date.now(); return post({ rpc: 'pocEcho', token: p.v || '', args: ['안녕', 1] }); })
    .then(function (r) {
      var j = null; try { j = JSON.parse(r.text); } catch (e) { /* 무시 */ }
      var ok = !!(j && j.ok && j.token_ok === 1);
      show('POST rpc', (ok ? '성공 ' : '이상 ') + r.status + ' ' + (Date.now() - a) + 'ms');
      beacon('post_rpc', { ok: ok ? 1 : 0, status: r.status, ms: Date.now() - a, head: r.text.slice(0, 60) });
    })
    .catch(function (e) { show('POST rpc', '실패 ' + String(e).slice(0, 60)); beacon('post_rpc', { ok: 0, err: String(e).slice(0, 80) }); });

  addEventListener('resize', function () { var s = snap(); show('크기 변경', s.w + 'x' + s.h); beacon('resize', s); });
  addEventListener('pageshow', function (e) { beacon('pageshow', { persisted: e.persisted ? 1 : 0 }); });
  addEventListener('pagehide', function () { beacon('pagehide', {}); });
  document.addEventListener('visibilitychange', function () { beacon('vis', { state: document.visibilityState }); });
})();
