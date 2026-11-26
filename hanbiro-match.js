/*!
 * 한비로 지결서 매칭 — fund-status 사이트용 사이드바
 *
 * 붙이는 법: 사이트 index.html 맨 아래에
 *   <script src="hanbiro-match.js"></script>
 * 버튼: 페이지에 id="hanbiroMatchBtn" 버튼이 있으면 그걸 쓰고, 없으면 오른쪽 아래에 버튼을 만들어 줌.
 * 현재 보고 있는 발전소를 넘기려면 사이트 코드에서 window.HSEF_currentSite = '발전소명' 으로 두면 됨.
 *
 * 필요한 것: 크롬 확장 "지출확인"(한비로 읽기), Apps Script 웹앱 URL과 키(시트 읽기·쓰기)
 */
(function () {
  'use strict';

  /* ===================== 설정 ===================== */
  const LS_URL = 'hm.gsUrl', LS_KEY = 'hm.gsKey', LS_W = 'hm.width';
  const mem = {};
  const store = {
    get(k) { try { return localStorage.getItem(k) || mem[k] || ''; } catch (e) { return mem[k] || ''; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const HANBIRO_DOC = id => 'https://hsefarm.hanbiro.net/ngw/app/#/approval/view/refer/rdocu/?doc_id=' + id;
  const MAX_READ = 80;           // 한 번에 읽을 결의서 최대 개수
  const DATE_WINDOW = 45;        // X·빈칸 G열 줄을 같은 건으로 볼 날짜 차이(일)

  /* ===================== 유틸 ===================== */
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');
  const money = s => Number(String(s || '').replace(/[^0-9.-]/g, '')) || 0;
  const days = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
  const yymmdd = s => { const m = /(\d\d)\/(\d\d)\/(\d\d)/.exec(s || ''); return m ? '20' + m[1] + '-' + m[2] + '-' + m[3] : ''; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ===================== 확장 프로그램 호출 ===================== */
  let extReady = !!document.documentElement.getAttribute('data-hsef-ext');
  window.addEventListener('message', e => { if (e.data && e.data.type === 'HSEF_EXT_READY') extReady = true; });
  function ext(payload, timeout) {
    return new Promise((resolve, reject) => {
      if (!extReady && !document.documentElement.getAttribute('data-hsef-ext')) {
        return reject(new Error('크롬 확장 "지출확인"이 설치·실행되어 있지 않습니다'));
      }
      const id = 'r' + Math.random().toString(36).slice(2);
      const t = setTimeout(() => { window.removeEventListener('message', on); reject(new Error('한비로 응답 시간 초과')); }, timeout || 180000);
      function on(e) {
        if (!e.data || e.data.type !== 'HSEF_EXT_RES' || e.data.id !== id) return;
        clearTimeout(t); window.removeEventListener('message', on);
        const r = e.data.resp || {};
        r.ok ? resolve(r.data) : reject(new Error(r.error || '한비로 오류'));
      }
      window.addEventListener('message', on);
      window.postMessage({ type: 'HSEF_EXT_REQ', id, payload }, '*');
    });
  }

  /* ===================== Apps Script 호출 ===================== */
  async function gs(action, params) {
    const url = store.get(LS_URL), key = store.get(LS_KEY);
    if (!url || !key) throw new Error('설정(⚙)에서 Apps Script URL과 키를 먼저 넣어 주세요');
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(Object.assign({ action, key }, params || {})) });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || '시트 오류');
    return j.data;
  }

  /* ===================== 화면 ===================== */
  const CSS = `
  #hm-btn{position:fixed;right:18px;bottom:18px;z-index:9998;background:#2563eb;color:#fff;border:none;border-radius:22px;padding:10px 16px;font:600 14px/1 sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer}
  #hm-panel{position:fixed;top:0;right:0;height:100vh;width:min(var(--hm-w,480px),100vw);z-index:9999;background:var(--hm-bg);color:var(--hm-fg);box-shadow:-6px 0 24px rgba(0,0,0,.18);display:none;flex-direction:column;font:14px/1.5 -apple-system,"Malgun Gothic",sans-serif;
    --hm-bg:#fff;--hm-fg:#1f2328;--hm-mut:#6b7280;--hm-line:#e3e6ea;--hm-soft:#f5f6f8;--hm-acc:#2563eb;--hm-ok:#15803d;--hm-okbg:#e7f6ec;--hm-bad:#b91c1c;--hm-badbg:#fdecec;--hm-warn:#a16207;--hm-warnbg:#fdf6e3}
  @media (prefers-color-scheme:dark){#hm-panel{--hm-bg:#1e2125;--hm-fg:#e6e8eb;--hm-mut:#9aa1ab;--hm-line:#30353b;--hm-soft:#15171a;--hm-acc:#6b9bff;--hm-ok:#4ade80;--hm-okbg:#163222;--hm-bad:#f87171;--hm-badbg:#3a1c1c;--hm-warn:#facc15;--hm-warnbg:#3a3214}}
  #hm-panel.on{display:flex}
  html.hm-open body{padding-right:var(--hm-w,480px);box-sizing:border-box;transition:padding-right .15s}
  html.hm-open #hm-btn{display:none}
  @media (max-width:900px){html.hm-open body{padding-right:0}}
  #hm-grip{position:absolute;left:-4px;top:0;width:8px;height:100%;cursor:ew-resize;z-index:1}
  #hm-grip:hover,#hm-grip.drag{background:rgba(37,99,235,.25)}
  #hm-panel header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--hm-line)}
  #hm-panel header b{font-size:16px;flex:1}
  #hm-panel button{font:inherit;cursor:pointer;border:1px solid var(--hm-line);background:var(--hm-bg);color:var(--hm-fg);border-radius:6px;padding:6px 10px}
  #hm-panel button.pri{background:var(--hm-acc);border-color:var(--hm-acc);color:#fff}
  #hm-panel button:disabled{opacity:.45;cursor:not-allowed}
  #hm-panel input{font:inherit;padding:6px 8px;border:1px solid var(--hm-line);border-radius:6px;background:var(--hm-soft);color:var(--hm-fg)}
  #hm-top{display:flex;gap:6px;padding:10px 14px;border-bottom:1px solid var(--hm-line)}
  #hm-top input{flex:1}
  #hm-body{flex:1;overflow:auto;padding:12px 14px}
  #hm-foot{border-top:1px solid var(--hm-line);padding:10px 14px;display:flex;gap:8px;align-items:center}
  #hm-foot span{flex:1;color:var(--hm-mut);font-size:13px}
  .hm-log{font-size:12px;color:var(--hm-mut);white-space:pre-wrap;background:var(--hm-soft);border-radius:6px;padding:8px;max-height:140px;overflow:auto;margin-bottom:10px}
  .hm-sec{margin:14px 0 6px;font-weight:700;display:flex;gap:6px;align-items:center}
  .hm-sec small{font-weight:400;color:var(--hm-mut)}
  .hm-item{border:1px solid var(--hm-line);border-radius:8px;padding:8px 10px;margin:6px 0;font-size:13px}
  .hm-item label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
  .hm-item .t{font-weight:600}
  .hm-item .m{color:var(--hm-mut);font-size:12px}
  .hm-item a{color:var(--hm-acc)}
  .hm-tag{font-size:11px;padding:1px 6px;border-radius:99px;margin-left:4px;white-space:nowrap}
  .hm-r{background:var(--hm-badbg);color:var(--hm-bad)} .hm-o{background:var(--hm-warnbg);color:var(--hm-warn)} .hm-g{background:var(--hm-okbg);color:var(--hm-ok)} .hm-n{background:var(--hm-soft);color:var(--hm-mut)}
  .hm-split{width:100%;border-collapse:collapse;margin-top:6px}
  .hm-split td{padding:3px 2px}
  .hm-split input{width:100%}
  .hm-split input.num{text-align:right}
  .hm-sum{font-size:12px;font-weight:600;margin-top:4px}
  .hm-sum.ok{color:var(--hm-ok)} .hm-sum.bad{color:var(--hm-bad)}
  .hm-box{background:var(--hm-soft);border-radius:8px;padding:10px;font-size:13px}
  .hm-box table{width:100%} .hm-box td:last-child{text-align:right}
  .hm-warnbar{background:var(--hm-warnbg);color:var(--hm-warn);border-radius:6px;padding:8px 10px;font-size:13px;margin-bottom:8px}
  .hm-set{display:grid;gap:6px;padding:10px 14px;border-bottom:1px solid var(--hm-line);background:var(--hm-soft)}
  `;

  function mount() {
    if ($('#hm-panel')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    let btn = document.getElementById('hanbiroMatchBtn');
    if (!btn) {
      btn = document.createElement('button'); btn.id = 'hm-btn'; btn.textContent = '한비로 지결서 매칭';
      document.body.appendChild(btn);
    }
    btn.addEventListener('click', open);
    const p = document.createElement('div'); p.id = 'hm-panel';
    p.innerHTML = `
      <header><b>한비로 지결서 매칭</b><button id="hm-gear" title="설정">⚙</button><button id="hm-x" title="닫기">✕</button></header>
      <div class="hm-set" id="hm-set" style="display:none">
        <div style="font-size:12px;color:var(--hm-mut)">Apps Script 웹앱 URL과 키 (setupKey 실행 로그에 나온 값)</div>
        <input id="hm-url" placeholder="https://script.google.com/macros/s/.../exec">
        <input id="hm-key" placeholder="키">
        <div><button class="pri" id="hm-save">저장</button> <button id="hm-test">연결 확인</button> <span id="hm-test-r" style="font-size:12px"></span></div>
      </div>
      <div id="hm-top"><input id="hm-site" list="hm-sites" placeholder="발전소명 (일자별 기록 G열 이름)"><datalist id="hm-sites"></datalist><button id="hm-pagesite" title="왼쪽 화면에서 선택한 발전소 가져오기">← 화면</button><button class="pri" id="hm-run">매칭 시작</button></div>
      <div id="hm-body"><div class="m" style="color:var(--hm-mut)">발전소를 고르고 [매칭 시작]을 누르세요. 한비로가 로그인된 크롬 탭이 있어야 합니다.</div></div>
      <div id="hm-foot"><span id="hm-cnt">선택 0건</span><button class="pri" id="hm-apply" disabled>선택한 것 반영</button></div>`;
    document.body.appendChild(p);
    $('#hm-x').onclick = close;
    // 왼쪽 가장자리 끌어서 폭 조절 (화면 본문은 그만큼 왼쪽으로 밀림)
    const grip = document.createElement('div'); grip.id = 'hm-grip'; grip.title = '끌어서 폭 조절'; p.appendChild(grip);
    grip.addEventListener('mousedown', e => {
      e.preventDefault(); grip.classList.add('drag');
      const mv = ev => setW(window.innerWidth - ev.clientX);
      const up = () => { grip.classList.remove('drag'); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); store.set(LS_W, String(curW)); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
    setW(Number(store.get(LS_W)) || 480);
    $('#hm-pagesite').onclick = () => { const v = pageSite(); if (v) $('#hm-site').value = v; };
    $('#hm-gear').onclick = () => { const s = $('#hm-set'); s.style.display = s.style.display === 'none' ? 'grid' : 'none'; };
    $('#hm-url').value = store.get(LS_URL); $('#hm-key').value = store.get(LS_KEY);
    $('#hm-save').onclick = () => { store.set(LS_URL, $('#hm-url').value.trim()); store.set(LS_KEY, $('#hm-key').value.trim()); $('#hm-test-r').textContent = '저장됨'; loadSites(); };
    $('#hm-test').onclick = async () => {
      const r = $('#hm-test-r'); r.textContent = '확인 중…';
      try { await gs('ping'); r.textContent = '시트 ✔'; } catch (e) { r.textContent = '시트 ✖ ' + e.message; return; }
      try { await ext({ action: 'ping' }, 10000); r.textContent += ' / 확장 ✔'; } catch (e) { r.textContent += ' / 확장 ✖ ' + e.message; }
    };
    $('#hm-run').onclick = () => runMatch($('#hm-site').value.trim());
    $('#hm-site').addEventListener('keydown', e => { if (e.key === 'Enter') runMatch($('#hm-site').value.trim()); });
    $('#hm-apply').onclick = applySelected;
    if (!store.get(LS_URL) || !store.get(LS_KEY)) $('#hm-set').style.display = 'grid';
  }

  let curW = 480, lastPageSite = '', watch = null;
  function setW(w) {
    curW = Math.max(340, Math.min(Math.round(w), Math.floor(window.innerWidth * 0.7)));
    document.documentElement.style.setProperty('--hm-w', curW + 'px');
  }
  // 왼쪽 화면(현장별 자금현황)의 '발전소 선택' 값
  function pageSite() {
    const el = document.getElementById('siteInput');
    return (el && el.value.trim()) || window.HSEF_currentSite || '';
  }
  function open() {
    mount();
    $('#hm-panel').classList.add('on');
    document.documentElement.classList.add('hm-open');
    lastPageSite = pageSite();
    if (lastPageSite && !$('#hm-site').value) $('#hm-site').value = lastPageSite;
    // 사이드바를 연 채로 왼쪽에서 발전소를 바꾸면 따라 바뀜
    clearInterval(watch);
    watch = setInterval(() => {
      const v = pageSite();
      if (v && v !== lastPageSite) { lastPageSite = v; if (!$('#hm-run').disabled) $('#hm-site').value = v; }
    }, 800);
    loadSites();
  }
  function close() {
    $('#hm-panel').classList.remove('on');
    document.documentElement.classList.remove('hm-open');
    clearInterval(watch);
  }

  let SITES = [], ALIASES = [];
  async function loadSites() {
    if (SITES.length) return;
    try {
      const d = await gs('sites');
      SITES = d.sites || []; ALIASES = d.aliases || [];
      $('#hm-sites').innerHTML = SITES.map(s => `<option value="${esc(s)}">`).join('');
    } catch (e) { /* 설정 전이면 조용히 */ }
  }

  /* ===================== 결의서 해석 ===================== */
  // G열 이름 → 그 현장을 가리키는 이름 목록
  function namesOf(site) {
    const out = new Set([site]);
    ALIASES.forEach(a => { if (a.site === site) out.add(a.alias); });
    const m = /^(.+?)(\d+)~(\d+)호$/.exec(site);            // 김씨1~6호 → 김씨1-6호, 김씨 1~6호
    if (m) { out.add(m[1] + m[2] + '-' + m[3] + '호'); out.add(m[1] + ' ' + m[2] + '~' + m[3] + '호'); }
    return [...out].filter(n => n.length >= 2 || n === site);
  }
  // 글자 안에서 이름 찾기 (한 글자 이름은 앞뒤가 한글이 아닐 때만)
  // strict: 다른 현장 찾을 때 — 앞이 한글이면 안 됨(김지현→지현 X), 뒤가 한글이면 태양광·발전소·호만 허용(태양광→태양 X)
  function findName(text, name, strict) {
    if (strict) {
      const re = new RegExp('(^|[^가-힣])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^가-힣]|태양광|발전소|호|$)');
      const m = re.exec(text); return m ? m.index + m[1].length : -1;
    }
    if (name.length >= 2) return text.indexOf(name);
    const re = new RegExp('(^|[^가-힣])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^가-힣]|태양광|$)');
    const m = re.exec(text); return m ? m.index + m[1].length : -1;
  }
  function sitesIn(text, target) {
    const hits = [];
    const all = new Set(SITES);
    ALIASES.forEach(a => all.add(a.site));
    all.forEach(site => {
      let best = -1;
      namesOf(site).forEach(n => { const i = findName(text, n, site !== target); if (i >= 0 && (best < 0 || i < best)) best = i; });
      if (best >= 0) hits.push({ site, idx: best });
    });
    // 긴 이름에 포함되는 짧은 이름 제거 (예: '경도'가 '경도외'에, '한빛'이 '한빛1~3호'에)
    return hits.filter(h => !hits.some(o => o !== h && o.site.length > h.site.length && o.site.indexOf(h.site) >= 0 && Math.abs(o.idx - h.idx) < 3))
      .sort((a, b) => a.idx - b.idx);
  }
  function amountsIn(seg) {
    return (seg.match(/\d{1,3}(?:,\d{3})+/g) || []).map(money).filter(n => n >= 1000);
  }
  function shortTitle(title, names) {
    let t = title.replace(/지급의 ?건|납부의 ?건|결제의 ?건|지출결의서|의 ?건|지급|\(VAT ?포함\)/g, ' ');
    t = t.replace(/태양광발전소|태양광/g, ' ');
    names.forEach(n => { if (n.length >= 2) t = t.split(n).join(' '); });
    return t.replace(/[,_()·]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseDoc(info, doc, target) {
    const body = doc.body || '';
    const all = (doc.title || info.title) + '\n' + body;
    const d = {
      id: info.id, title: info.title || doc.title, docNo: info.docNo,
      drafted: yymmdd(info.drafted), completed: yymmdd(info.completed),
      line: info.line, current: info.current,
      approved: !info.current,                                  // 현재 결재자가 없으면 결재 완료
      card: /카드결제|법인카드/.test(all),
      usd: /US\$\s*[\d,.]+/.test(body) ? (body.match(/US\$\s*([\d,.]+)/) || [])[1] : '',
      total: money((body.match(/지급요청금액\s*₩?\s*([\d,]+)/) || body.match(/지출결의액\s*₩?\s*([\d,]+)/) || body.match(/합계금액\s*([\d,]+)/) || [])[1]),
      vendor: ((body.match(/거\s*래\s*처\s*(.+?)\s*지급\s*방법/) || [])[1] ||
        // '연번 내역 지출일 금액 거래처 지급방법' 표 형식
        (body.match(/\n\s*\d+\s+.+?\s+\d{4}[-.]\s?\d{1,2}[-.]\s?\d{1,2}\.?\s+[\d,]+\s+(.+?)\s+(?:계좌이체|카드|현금|자동이체)/) || [])[1] || '').replace(/\s+/g, ' ').trim(),
      attachments: doc.attachments || [], comments: doc.comments || '',
      sites: [], shares: {}, share: null, bundle: false, bundleOK: false, needAttach: false,
    };
    const found = sitesIn(all, target);
    d.sites = found.map(f => f.site);
    if (!d.sites.includes(target)) d.sites.unshift(target);
    // 결의서 제목에 이 현장만 있으면(다른 현장·'외 n건'·쉼표 나열 없음) 한 현장 건으로 봄
    const ttl = d.title || '';
    const tSites = sitesIn(ttl, target).map(f => f.site);
    const titleSingle = tSites.includes(target) && tSites.length === 1 && !/외\s?\d+\s?건|[,，·]/.test(ttl);
    if (titleSingle) d.sites = [target];
    // 다른 현장 이름을 못 알아봐도 '○○ 외 n건'이나 쉼표로 나열된 목록이면 묶음으로 봄
    const listHint = /외\s?\d+\s?건/.test(all) || namesOf(target).some(n => n.length >= 1 &&
      new RegExp('[,，·]\\s*' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![가-힣])|(^|[^가-힣])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[,，·]').test(all));
    d.bundle = !titleSingle && (d.sites.length > 1 || listHint);
    if (!d.bundle) { d.share = d.total; d.shares[target] = d.total; return d; }
    // 현장별 금액: 본문에 나오는 모든 현장 이름 위치를 잡고, 이름 ~ 다음 이름(또는 '합 계') 사이에서
    // (공급가액, VAT포함) 짝을 찾아 VAT포함 금액을 씀. 짝이 없으면 바로 뒤 금액 하나만 있을 때 그 금액.
    const occ = [];
    const allSites = new Set(SITES); ALIASES.forEach(a => allSites.add(a.site));
    allSites.forEach(site => namesOf(site).forEach(n => {
      if (n.length < 2 && n !== site) return;
      let from = 0, i;
      while ((i = findName(body.slice(from), n, site !== target)) >= 0) { occ.push({ site, idx: from + i, len: n.length }); from += i + n.length; }
    }));
    occ.sort((a, b) => a.idx - b.idx || b.len - a.len);
    const stops = []; let mm; const reStop = /합\s?계|합계금액|첨부서류|비\s?고/g;
    while ((mm = reStop.exec(body))) stops.push(mm.index);
    occ.forEach((o, i) => {
      if (d.shares[o.site]) return;
      let end = Math.min(body.length, o.idx + 200);
      for (let j = i + 1; j < occ.length; j++) if (occ[j].idx > o.idx + o.len - 1 && occ[j].site !== o.site) { end = Math.min(end, occ[j].idx); break; }
      stops.forEach(sp => { if (sp > o.idx && sp < end) end = sp; });
      const am = amountsIn(body.slice(o.idx + o.len, end)).filter(a => !d.total || a < d.total);
      for (let k = 0; k + 1 < am.length; k++) {
        if (Math.abs(am[k + 1] - Math.round(am[k] * 1.1)) <= 10) { d.shares[o.site] = am[k + 1]; return; }
      }
      if (am.length === 1 && end - o.idx < 80) d.shares[o.site] = am[0];
    });
    d.share = d.shares[target] != null ? d.shares[target] : null;
    const sum = d.sites.reduce((s, x) => s + (d.shares[x] || 0), 0);
    d.bundleOK = d.sites.every(x => d.shares[x]) && d.total > 0 && sum === d.total;
    d.needAttach = !d.bundleOK;
    return d;
  }

  /* ===================== 매칭 ===================== */
  let STATE = null;

  function log(msg) { const el = $('#hm-log'); if (el) { el.textContent += msg + '\n'; el.scrollTop = 1e9; } }

  async function runMatch(site) {
    if (!site) return alert('발전소명을 넣어 주세요');
    mount();
    const body = $('#hm-body');
    body.innerHTML = '<div class="hm-log" id="hm-log"></div>';
    $('#hm-apply').disabled = true; $('#hm-run').disabled = true;
    try {
      await loadSites();
      const names = namesOf(site);
      // 1) 한비로 검색
      const kw = site.length <= 1 ? site + ' 태양광발전소' : site;
      log('한비로에서 "' + kw + '" 검색 중…');
      const sr = await ext({ action: 'search', keyword: kw, maxPages: site.length <= 1 ? 15 : 5 });
      let list = sr.docs || [];
      log('검색 결과 ' + (sr.total || list.length) + '건 / 목록 ' + list.length + '건');
      if (site.length <= 1) list = list.filter(x => new RegExp('^' + site + '([ _]|태양광)').test(x.title));
      // 별칭으로도 검색 (2글자 이상)
      for (const n of names.filter(n => n !== site && n.length >= 2).slice(0, 3)) {
        try {
          const r2 = await ext({ action: 'search', keyword: n, maxPages: 3 });
          (r2.docs || []).forEach(x => { if (!list.some(y => y.id === x.id)) list.push(x); });
        } catch (e) { log('별칭 검색 실패: ' + n); }
      }
      if (list.length > MAX_READ) { log('결의서가 ' + list.length + '건이라 최근 ' + MAX_READ + '건만 읽습니다'); list = list.slice(0, MAX_READ); }
      // 2) 결의서 읽기
      log('결의서 ' + list.length + '건 읽는 중… (한비로 탭 화면이 바뀝니다)');
      const docs = await ext({ action: 'readDocs', ids: list.map(x => x.id) }, 600000);
      const bad = (doc, i) => !doc.error && (!/[\d,]{5,}/.test(doc.body || '') || !/지급요청금액|지출결의액|합계금액|합\s?계/.test(doc.body || '') ||
        docs.some((o, j) => j !== i && o.body && o.body === doc.body));
      for (let round = 0; round < 2; round++) {
        const redo = docs.map((doc, i) => bad(doc, i) ? i : -1).filter(i => i >= 0);
        if (!redo.length) break;
        log('제대로 못 읽은 결의서 ' + redo.length + '건 다시 읽는 중…');
        for (const i of redo) {
          try { const [again] = await ext({ action: 'readDocs', ids: [list[i].id] }, 60000); if (again && again.body) docs[i] = again; } catch (e) {}
        }
      }
      let parsed = docs.map((doc, i) => doc.error ? null : parseDoc(list[i], doc, site)).filter(Boolean);
      // 본문에 이 현장이 실제로 없으면(전문검색 잡음) 제외
      parsed = parsed.filter(d => sitesIn(d.title + '\n' + (docs.find(x => x.id === d.id) || {}).body, site).some(h => h.site === site));
      log('이 현장 결의서 ' + parsed.length + '건');
      // 3) 시트 읽기
      const amounts = [];
      parsed.forEach(d => { if (d.total) amounts.push(d.total); Object.values(d.shares).forEach(a => amounts.push(a)); });
      log('일자별 기록·계산서 읽는 중…');
      const sd = await gs('siteData', { site, names, amounts });
      // 4) 대조
      const res = match(site, names, parsed, sd);
      // 5) 실제 지급 확인 (빠진 건만)
      const qs = res.items.filter(it => it.kind === 'missing').map(it => ({ id: it.key, amount: it.amount, keywords: [site].concat(names).concat(it.doc.vendor ? [it.doc.vendor.split(' ')[0]] : []) }));
      if (qs.length) {
        log('전체일정표에서 실제 지급 확인 중…');
        try {
          const pc = await gs('paidCheck', { queries: qs });
          (pc.results || []).forEach(r => {
            const it = res.items.find(x => x.key === r.id); if (!it) return;
            it.paid = r.hits; it.checked = r.hits.length > 0;
            const dt = guessDate(r.hits[0], it.doc); if (dt) it.date = dt;
          });
          if (pc.unavailable) log('전체일정표 _검색인덱스 탭이 없어 지급 확인을 건너뜁니다');
        } catch (e) { log('지급 확인 실패: ' + e.message); }
      }
      STATE = { site, names, docs: parsed, sd, res };
      render();
    } catch (e) {
      log('✖ ' + e.message);
    } finally { $('#hm-run').disabled = false; }
  }

  function guessDate(hit, doc) {
    if (hit) {
      let m = /(20\d\d)[-.\/]\s?(\d{1,2})[-.\/]\s?(\d{1,2})/.exec(hit);
      if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
      m = /(\d{1,2})월\s?(\d{1,2})일/.exec(hit);
      if (m) return (doc.completed || doc.drafted || '2026').slice(0, 4) + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
    }
    return doc.completed || doc.drafted;
  }

  function match(site, names, docs, sd) {
    const rows = sd.rows || [];
    const used = new Set();
    const items = [];
    const hasName = r => names.some(n => findName(r.memo, n) >= 0);
    const add = it => { it.key = 'k' + items.length; items.push(it); return it; };

    docs.forEach(d => {
      const base = { doc: d };
      if (d.card) return add(Object.assign(base, { kind: 'card', amount: d.share || d.total }));
      if (!d.approved) return add(Object.assign(base, { kind: 'pending', amount: d.share || d.total }));
      if (d.usd && !d.total) return add(Object.assign(base, { kind: 'usd', amount: 0 }));
      const amt = d.share;
      if (amt) {
        const cand = rows.filter(r => !used.has(r.row) && r.inout !== '입금' && r.amount === amt);
        const okRow = cand.find(r => r.site === site);
        if (okRow) { used.add(okRow.row); return add(Object.assign(base, { kind: 'ok', amount: amt, row: okRow })); }
        const named = cand.find(r => hasName(r));
        if (named) { used.add(named.row); return add(Object.assign(base, { kind: 'setG', amount: amt, row: named, checked: true })); }
        const near = cand.find(r => (r.site === 'X' || r.site === 'x' || !r.site) && days(r.date, d.completed || d.drafted) <= DATE_WINDOW);
        if (near) { used.add(near.row); return add(Object.assign(base, { kind: 'setG', amount: amt, row: near, checked: false, weak: true })); }
      }
      if (d.bundle) {
        const bRow = rows.find(r => !used.has(r.row) && r.inout !== '입금' && r.amount === d.total);
        if (bRow) {
          used.add(bRow.row);
          const parts = d.sites.map(s => ({ site: s, amount: d.shares[s] || 0 }));
          return add(Object.assign(base, { kind: 'split', amount: d.total, row: bRow, parts, checked: d.bundleOK }));
        }
      }
      if (amt) return add(Object.assign(base, { kind: 'missing', amount: amt, date: d.completed || d.drafted, checked: false }));
      // 묶음인데 이 현장 금액을 모름 + 일자별 기록에도 없음
      return add(Object.assign(base, { kind: 'missingBundle', amount: 0, date: d.completed || d.drafted,
        parts: d.sites.map(s => ({ site: s, amount: d.shares[s] || 0 })), checked: false }));
    });

    // 결의서와 안 맞은 이 현장 지출 줄
    const orphan = rows.filter(r => r.site === site && r.inout !== '입금' && !used.has(r.row));
    // 같은 현장·같은 금액 두 줄 이상 → 중복 의심
    const dup = [];
    const bySig = {};
    rows.filter(r => r.site === site && r.inout !== '입금').forEach(r => { const k = r.amount; (bySig[k] = bySig[k] || []).push(r); });
    const stage = r => ((r.memo || '').match(/계약금|선급금|중도금|기성|잔금|1차|2차|3차/) || [''])[0];
    Object.values(bySig).forEach(g => {
      if (g.length < 2 || g[0].amount < 100000) return;
      if (g.every(r => used.has(r.row))) return;                       // 줄마다 각자 결의서가 있음 → 중복 아님
      if (new Set(g.map(stage)).size === g.length && g.every(stage)) return; // 계약금/잔금처럼 단계가 다 다름
      dup.push(g);
    });

    const inc = rows.filter(r => r.site === site && r.inout === '입금').reduce((s, r) => s + r.amount, 0);
    const exp = rows.filter(r => r.site === site && r.inout !== '입금').reduce((s, r) => s + r.amount, 0);
    const inv = (sd.invoices || []).reduce((s, r) => s + (r.amount || 0), 0);
    return { items, orphan, dup, inc, exp, inv };
  }

  /* ===================== 결과 그리기 ===================== */
  const KIND = {
    missing: ['일자별 기록에 없음', 'hm-r'], missingBundle: ['없음 · 금액 확인 필요', 'hm-r'],
    setG: ['발전소명 수정', 'hm-o'], split: ['묶음 나누기', 'hm-o'],
    ok: ['일치', 'hm-g'], pending: ['미승인', 'hm-n'], card: ['카드', 'hm-n'], usd: ['외화 · 원화금액 확인', 'hm-n'],
  };

  function docLink(d) {
    return `<a href="${HANBIRO_DOC(d.id)}" target="_blank" rel="noopener">${esc(d.title)}</a>`;
  }

  function render() {
    const { site, res, docs } = STATE;
    const body = $('#hm-body');
    const logHtml = $('#hm-log') ? $('#hm-log').outerHTML : '';
    const notes = ALIASES.filter(a => a.site === site && a.note).map(a => a.note);
    let h = logHtml;
    if (notes.length) h += `<div class="hm-warnbar">⚠ ${esc([...new Set(notes)].join(' / '))}</div>`;

    const sec = (title, kinds, sub) => {
      const list = res.items.filter(i => kinds.includes(i.kind));
      if (!list.length) return '';
      return `<div class="hm-sec">${title} <small>${list.length}건${sub ? ' · ' + sub : ''}</small></div>` + list.map(itemHtml).join('');
    };
    h += sec('🟥 일자별 기록에 없음', ['missing', 'missingBundle'], '전체일정표에 지급이 확인된 건만 기본 체크');
    h += sec('🟧 발전소명 잘못 걸림', ['setG']);
    h += sec('🟨 묶음이라 나눠야 함', ['split'], '합계가 맞아야 반영 가능');
    if (res.dup.length) {
      h += `<div class="hm-sec">⬜ 중복 의심 <small>${res.dup.length}묶음 · 알림만</small></div>` + res.dup.map(g =>
        `<div class="hm-item"><div class="t">${won(g[0].amount)}원 × ${g.length}줄</div>${g.map(r => `<div class="m">${r.row}행 · ${r.date} · ${esc(r.vendor)} · ${esc(r.memo)}</div>`).join('')}</div>`).join('');
    }
    h += sec('⬜ 미승인 · 카드 · 외화', ['pending', 'card', 'usd'], '입력 안 함');
    if (res.orphan.length) {
      h += `<div class="hm-sec">⬜ 결의서를 못 찾은 이 현장 지출 <small>${res.orphan.length}줄 · 묶음 결의서·다른 이름일 수 있음</small></div>` +
        res.orphan.map(r => `<div class="hm-item"><div class="m">${r.row}행 · ${r.date} · ${won(r.amount)} · ${esc(r.vendor)} · ${esc(r.memo)}</div></div>`).join('');
    }
    h += sec('✅ 일치', ['ok']);
    h += summaryHtml();
    body.innerHTML = h;
    bindItems();
    updateCount();
  }

  function itemHtml(it) {
    const d = it.doc, [lab, cls] = KIND[it.kind];
    const canCheck = ['missing', 'missingBundle', 'setG', 'split'].includes(it.kind);
    let detail = '';
    if (it.kind === 'setG') detail = `<div class="m">${it.row.row}행 · ${it.row.date} · ${won(it.row.amount)} · ${esc(it.row.memo)} · G열 <b>${esc(it.row.site || '(빈칸)')}</b> → <b>${esc(STATE.site)}</b>${it.weak ? ' <span class="hm-tag hm-o">금액·날짜만 맞음 — 확인</span>' : ''}</div>`;
    if (it.kind === 'missing') {
      detail = `<div class="m">추가할 줄: <input type="date" data-k="${it.key}" data-f="date" value="${esc(it.date)}" style="padding:2px 4px"> · ${won(it.amount)} · ${esc(d.vendor)} · <input data-k="${it.key}" data-f="memo" value="${esc(memoFor(STATE.site, d))}" style="width:60%;padding:2px 4px"></div>` +
        (it.paid && it.paid.length ? `<div class="m">💳 지급 확인: ${esc(it.paid[0])}</div>` : `<div class="m" style="color:var(--hm-bad)">전체일정표에서 지급 내역을 못 찾음 — 확인 후 체크</div>`);
    }
    if (it.kind === 'split' || it.kind === 'missingBundle') detail = splitEditor(it);
    if (it.kind === 'pending') detail = `<div class="m">현재 결재자: ${esc(d.current)} · ${won(it.amount)}</div>`;
    if (it.kind === 'card') detail = `<div class="m">${won(it.amount)} — 카드결제는 일자별 기록에 넣지 않음</div>`;
    if (it.kind === 'usd') detail = `<div class="m">US$ ${esc(d.usd)} — 원화 지급액을 일자별 기록에서 직접 확인</div>`;
    if (it.kind === 'ok') detail = `<div class="m">${it.row.row}행 · ${it.row.date} · ${won(it.amount)}</div>`;
    const att = d.attachments && d.attachments.length && (it.kind === 'split' || it.kind === 'missingBundle') && d.needAttach
      ? `<div class="m">📎 ${d.attachments.map(esc).join(', ')} — <a href="${HANBIRO_DOC(d.id)}" target="_blank" rel="noopener">한비로에서 첨부 미리보기</a></div>` : '';
    const cmt = d.comments && !/^0\/0$/.test(d.comments) ? `<div class="m">💬 의견/변경기록 ${esc(d.comments)} — 한비로에서 확인</div>` : '';
    return `<div class="hm-item"><label>${canCheck ? `<input type="checkbox" data-k="${it.key}" ${it.checked ? 'checked' : ''}>` : ''}
      <div style="flex:1"><div class="t">${docLink(d)}<span class="hm-tag ${cls}">${lab}</span></div>
      <div class="m">${esc(d.drafted)} 기안 · ${esc(d.vendor)} · 결의 ${won(d.total)}${d.bundle ? ' · 묶음 ' + d.sites.length + '현장' : ''}${d.share && d.bundle ? ' · 이 현장 ' + won(d.share) : ''}</div>
      ${detail}${att}${cmt}</div></label></div>`;
  }

  function memoFor(site, d) { return site + ' ' + shortTitle(d.title, namesOf(site).concat(d.sites)); }

  function splitEditor(it) {
    const total = it.kind === 'split' ? it.row.amount : it.doc.total;
    const rowsHtml = it.parts.map((p, i) => `<tr><td style="width:45%"><input data-k="${it.key}" data-p="${i}" data-f="site" value="${esc(p.site)}" list="hm-sites"></td>
      <td><input class="num" data-k="${it.key}" data-p="${i}" data-f="amount" value="${p.amount ? won(p.amount) : ''}"></td>
      <td style="width:26px"><button data-k="${it.key}" data-del="${i}" title="삭제">×</button></td></tr>`).join('');
    const where = it.kind === 'split' ? `${it.row.row}행 ${it.row.date} · ${won(it.row.amount)} · ${esc(it.row.memo)} (G열 ${esc(it.row.site || '빈칸')})를 아래처럼 나눔`
      : `일자별 기록에 묶음 줄도 없음 — 이 현장 몫만 새 줄로 추가 (날짜 <input type="date" data-k="${it.key}" data-f="date" value="${esc(it.date)}" style="padding:2px 4px">)`;
    return `<div class="m">${where}</div>
      <table class="hm-split">${rowsHtml}</table>
      <div style="display:flex;gap:6px;margin-top:4px"><button data-k="${it.key}" data-addp="1">+ 현장</button><button data-k="${it.key}" data-even="1">n분의1</button></div>
      <div class="hm-sum" id="hm-sum-${it.key}"></div>
      <input type="hidden" data-total="${it.key}" value="${total}">`;
  }

  function bindItems() {
    const body = $('#hm-body');
    body.querySelectorAll('input[type=checkbox][data-k]').forEach(cb => cb.addEventListener('change', () => { item(cb.dataset.k).checked = cb.checked; updateCount(); }));
    body.querySelectorAll('input[data-f]').forEach(inp => inp.addEventListener('input', () => {
      const it = item(inp.dataset.k);
      if (inp.dataset.p != null) {
        const p = it.parts[+inp.dataset.p];
        if (inp.dataset.f === 'amount') p.amount = money(inp.value); else p.site = inp.value.trim();
        checkSplit(it);
      } else it[inp.dataset.f] = inp.value;
    }));
    body.querySelectorAll('input.num[data-k]').forEach(inp => inp.addEventListener('blur', () => { inp.value = money(inp.value) ? won(money(inp.value)) : ''; }));
    body.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); const it = item(b.dataset.k); it.parts.splice(+b.dataset.del, 1); render(); }));
    body.querySelectorAll('button[data-addp]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); item(b.dataset.k).parts.push({ site: '', amount: 0 }); render(); }));
    body.querySelectorAll('button[data-even]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); const it = item(b.dataset.k); const total = splitTotal(it); const n = it.parts.length; const each = Math.floor(total / n);
      it.parts.forEach((p, i) => { p.amount = i === n - 1 ? total - each * (n - 1) : each; }); render();
    }));
    STATE.res.items.filter(i => i.kind === 'split' || i.kind === 'missingBundle').forEach(checkSplit);
  }
  const item = k => STATE.res.items.find(i => i.key === k);
  const splitTotal = it => it.kind === 'split' ? it.row.amount : it.doc.total;

  function checkSplit(it) {
    const total = splitTotal(it), sum = it.parts.reduce((s, p) => s + (p.amount || 0), 0);
    const named = it.parts.every(p => p.site);
    const ok = sum === total && named && it.parts.length >= 2;
    it.valid = ok;
    const el = $('#hm-sum-' + it.key);
    if (el) { el.className = 'hm-sum ' + (ok ? 'ok' : 'bad'); el.textContent = (ok ? '✔ 합계 일치' : '✖ 합계 불일치') + ` — 입력 ${won(sum)} / 결의서 ${won(total)}` + (named ? '' : ' · 발전소명 빈칸') + (it.parts.length < 2 ? ' · 묶음 결의서라 다른 현장도 추가하세요' : ''); }
    const cb = $(`#hm-body input[type=checkbox][data-k="${it.key}"]`);
    if (cb) { cb.disabled = !ok; if (!ok) { cb.checked = false; it.checked = false; } }
    updateCount();
  }

  function summaryHtml() {
    const r = STATE.res;
    let add = 0;
    r.items.forEach(it => {
      if (!it.checked) return;
      if (it.kind === 'missing' || it.kind === 'setG') add += it.amount;
      if (it.kind === 'split') add += (it.parts.find(p => p.site === STATE.site) || {}).amount || 0;
      if (it.kind === 'missingBundle') add += (it.parts.find(p => p.site === STATE.site) || {}).amount || 0;
    });
    const invNote = (STATE.sd.invoices || []).length ? '' : ' (계산서발행 탭에 없음)';
    return `<div id="hm-summary"><div class="hm-sec">손익 <small>계산서는 현장별 자금현황 '계산서발행' 탭 기준 — ERP 연결 후 바뀜</small></div>
      <div class="hm-box"><table>
      <tr><td>계산서 발행금액${invNote}</td><td>${won(r.inv)}</td></tr>
      <tr><td>입금 합계</td><td>${won(r.inc)}</td></tr>
      <tr><td>미수금</td><td>${won(r.inv - r.inc)}</td></tr>
      <tr><td>지출 (지금 일자별 기록)</td><td>${won(r.exp)}</td></tr>
      <tr><td>이익 (지금)</td><td><b>${won(r.inv - r.exp)}</b></td></tr>
      <tr><td>체크한 것 반영 후 지출</td><td>${won(r.exp + add)}</td></tr>
      <tr><td>체크한 것 반영 후 이익</td><td><b>${won(r.inv - r.exp - add)}</b></td></tr>
      </table><div class="m" style="margin-top:6px">과입금 반환은 이익 계산에서 따로 빼서 보세요.</div></div>`;
  }

  function updateCount() {
    if (!STATE) return;
    const n = STATE.res.items.filter(i => i.checked).length;
    $('#hm-cnt').textContent = '선택 ' + n + '건';
    $('#hm-apply').disabled = n === 0;
    const sm = $('#hm-summary'); if (sm) sm.outerHTML = summaryHtml();
  }

  /* ===================== 반영 ===================== */
  async function applySelected() {
    const site = STATE.site;
    const changes = [];
    STATE.res.items.filter(i => i.checked).forEach(it => {
      if (it.kind === 'setG') changes.push({ type: 'setG', row: it.row.row, expect: { amount: it.row.amount }, value: site });
      if (it.kind === 'missing') changes.push({ type: 'insert', date: it.date, inout: '지출', amount: it.amount, vendor: it.doc.vendor, memo: it.memo || memoFor(site, it.doc), site });
      if (it.kind === 'split') {
        const base = shortTitle(it.row.memo, it.doc.sites.flatMap(namesOf)) || shortTitle(it.doc.title, it.doc.sites.flatMap(namesOf));
        changes.push({ type: 'split', row: it.row.row, expect: { amount: it.row.amount },
          parts: it.parts.map(p => ({ site: p.site, amount: p.amount, memo: (p.site + ' ' + base).trim() })) });
      }
      if (it.kind === 'missingBundle') {
        const mine = it.parts.find(p => p.site === site);
        if (mine && mine.amount) changes.push({ type: 'insert', date: it.date, inout: '지출', amount: mine.amount, vendor: it.doc.vendor, memo: memoFor(site, it.doc), site });
      }
    });
    if (!changes.length) return;
    if (!confirm(changes.length + '건을 일자별 기록에 반영합니다. 계속할까요?')) return;
    $('#hm-apply').disabled = true;
    try {
      const r = await gs('apply', { changes, user: 'fund-status' });
      const ok = r.results.filter(x => x.ok).length;
      alert('반영 ' + ok + '건 / 실패 ' + (r.results.length - ok) + '건\n\n' + r.results.map(x => (x.ok ? '✔ ' : '✖ ') + x.msg).join('\n'));
      runMatch(site);
    } catch (e) { alert('반영 실패: ' + e.message); $('#hm-apply').disabled = false; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.HanbiroMatch = { open, run: runMatch, _test: { parseDoc, sitesIn, match, setData(s, a) { SITES = s; ALIASES = a; } } };
})();
