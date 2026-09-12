/* =============================================================
   세종학당 한국어 3A — grammar & vocabulary lookup

   Data shape (lessons/lessonN.json, listed in lessons/manifest.json):
     lesson.lesson  → tab id, e.g. "1"     (matched against the tab buttons)
     lesson.num     → display label, e.g. "1과"
     lesson.vocab   → [{ theme, items: [{ kw, mean, ex, exen }] }]
     lesson.grammar → [{ form, tag, def_ko, def_en, info_en, ex, table, table2? }]
   ============================================================= */

let LESSONS = [];

const $  = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* Escapes text for both HTML bodies and quoted attributes. Coerces first so a
   missing or numeric JSON field can't throw. */
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => HTML_ENTITIES[ch]);

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- rendering ---------- */
const content     = $('#content');       // All view: vocabulary + full grammar cards
const grammarList = $('#grammarList');   // Grammar list view: grammar points only

/* The searchable haystack for a card, lowercased and stored in data-search. */
const searchText = (...parts) => parts.join(' ').toLowerCase();

function renderVocabCard(item, lesson) {
  return `
    <div class="vcard"
         data-id="${esc(`${lesson.num}|${item.kw}`)}"
         data-search="${esc(searchText(item.kw, item.mean, item.ex, item.exen))}">
      <span class="learned-badge" title="Learned">✓</span>
      <div class="kw">${esc(item.kw)}</div>
      <div class="mean">${esc(item.mean)}</div>
      <div class="ex">${esc(item.ex)}<span class="exen">${esc(item.exen)}</span></div>
    </div>`;
}

function renderVocabGroup(group, lesson) {
  return `
    <div class="theme">${esc(group.theme)}</div>
    <div class="grid">${group.items.map(item => renderVocabCard(item, lesson)).join('')}</div>`;
}

/* Conjugation tables differ only in which cells are emphasised (bold) as the result. */
const LAST_COLUMN  = (index, row) => index === row.length - 1;
const NO_EMPHASIS  = () => false;

function renderTable(table, isResultCell) {
  const head = table.head.map(heading => `<th>${esc(heading)}</th>`).join('');
  const rows = table.rows.map(row => {
    const cells = row
      .map((cell, index) => `<td class="${isResultCell(index, row) ? 'res' : ''}">${esc(cell)}</td>`)
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<div class="table-wrap"><table class="conj"><tr>${head}</tr>${rows}</table></div>`;
}

const grammarSearchText = entry => searchText(
  entry.form, entry.tag, entry.def_ko, entry.def_en,
  entry.ex.map(example => `${example.ko} ${example.en}`).join(' ')
);

/* Everything below a grammar point's heading — definition, examples, tables.
   Shared by the full card in the All view and the expandable row in the grammar list. */
function renderGrammarDetails(entry) {
  const examples = entry.ex.map(example => `
    <li>
      ${example.dia ? `<span class="dia">${esc(example.dia)}</span> ` : ''}${esc(example.ko)}
      <span class="exen">${esc(example.en)}</span>
    </li>`).join('');

  const secondTable = entry.table2
    ? `<div class="lbl">${esc(entry.table2.caption)}</div>${renderTable(entry.table2, NO_EMPHASIS)}`
    : '';

  return `
      <div class="lbl def">정의 · Definition</div>
      <div class="def-txt">
        <span class="ko">${esc(entry.def_ko)}</span>
        <span class="en">${esc(entry.def_en)}</span>
      </div>

      <div class="lbl">예시 · Examples</div>
      <ul class="ex-list">${examples}</ul>

      <div class="lbl">정보 · Form <span class="lbl-note">— ${esc(entry.info_en)}</span></div>
      ${renderTable(entry.table, LAST_COLUMN)}
      ${secondTable}`;
}

function renderGrammarCard(entry) {
  return `
    <div class="gcard ${entry.extra ? 'extra' : ''}" data-search="${esc(grammarSearchText(entry))}">
      <span class="form">${esc(entry.form)}</span>
      <div class="tagline">${esc(entry.tag)}</div>
      ${renderGrammarDetails(entry)}
    </div>`;
}

/* Tags on extra grammar end in "· 부가 문법 (Additional grammar)". The list shows
   that as a badge instead, so it's trimmed from the one-line summary. */
const shortTag = entry => (entry.extra ? entry.tag.replace(/\s*·\s*부가 문법.*$/, '') : entry.tag);

/* One row in the grammar list: form and gloss up front, full details on expand. */
function renderGrammarPoint(entry) {
  return `
    <details class="gpoint ${entry.extra ? 'extra' : ''}" data-search="${esc(grammarSearchText(entry))}">
      <summary class="gpoint-head">
        <span class="gpoint-form">${esc(entry.form)}</span>
        <span class="gpoint-tag en">${esc(shortTag(entry))}</span>
        ${entry.extra ? '<span class="gpoint-badge">부가 · Extra</span>' : ''}
      </summary>
      <div class="gpoint-body">${renderGrammarDetails(entry)}</div>
    </details>`;
}

function renderLessonHead(lesson) {
  return `
      <div class="lesson-head">
        <span class="num">${esc(lesson.num)}</span>
        <h2>${esc(lesson.title)}</h2>
        <span class="en">${esc(lesson.en)}</span>
      </div>`;
}

function renderLesson(lesson) {
  return `
    <section class="lesson" data-lesson="${esc(lesson.lesson)}">
      ${renderLessonHead(lesson)}

      <div class="block-title"><span class="dot v"></span>어휘 · Vocabulary</div>
      ${lesson.vocab.map(group => renderVocabGroup(group, lesson)).join('')}

      <div class="block-title"><span class="dot g"></span>문법 · Grammar</div>
      ${lesson.grammar.map(renderGrammarCard).join('')}
    </section>`;
}

const NO_RESULT = '<div class="noresult hidden">No matches found. Try another word.</div>';

/* The grammar list view: every lesson's grammar points, without the vocabulary.
   It reuses the section.lesson[data-lesson] structure of the All view, so the
   lesson tabs and search filter it through the same code path. */
function renderGrammarList() {
  grammarList.innerHTML =
    LESSONS
      .filter(lesson => lesson.grammar?.length)
      .map(lesson => `
        <section class="lesson" data-lesson="${esc(lesson.lesson)}">
          ${renderLessonHead(lesson)}
          <div class="gpoint-list">${lesson.grammar.map(renderGrammarPoint).join('')}</div>
        </section>`)
      .join('') + NO_RESULT;
}

function render() {
  content.innerHTML = LESSONS.map(renderLesson).join('') + NO_RESULT;
  renderGrammarList();
}

/* This script is loaded as app.js?v=N. Reusing that same query on the lesson
   fetches means one version bump in index.html also busts the cached JSON —
   otherwise newly added words can stay hidden behind a cached lesson file. */
const ASSET_VERSION = new URL(document.currentScript.src).search;

async function loadLessons() {
  try {
    const manifest = await fetch(`lessons/manifest.json${ASSET_VERSION}`).then(response => response.json());
    LESSONS = await Promise.all(
      manifest.map(file => fetch(`lessons/${file}${ASSET_VERSION}`).then(response => response.json()))
    );
    render();
    refreshBadges();
    document.dispatchEvent(new CustomEvent('lessons:loaded'));
  } catch (error) {
    console.error('Lesson data failed to load:', error);
    content.innerHTML =
      `<p class="load-error">Couldn't load the lesson files. Open this page from a web
       server (like GitHub Pages) instead of double-clicking the file.</p>`;
  }
}

/* ---------- search, lesson filtering & view ---------- */
const search       = $('#search');
const tabs         = $('#tabs');
const enToggle     = $('#enToggle');
const hint         = $('#hint');
const expandAllBtn = $('#expandAll');
let activeLesson = 'all';
let currentView  = 'all';      // 'all' = vocabulary + grammar, 'grammar' = grammar list only

const HINTS = {
  all:     'Tip: click any vocabulary card to flip it and hide the answer.',
  grammar: 'Tip: tap a grammar point to open its definition, examples and forms.',
};

/* Search and the lesson tabs act only on the view that's showing. */
const viewRoot = () => (currentView === 'grammar' ? grammarList : content);

function setView(nextView) {
  currentView = nextView;
  content.classList.toggle('hidden', currentView !== 'all');
  grammarList.classList.toggle('hidden', currentView !== 'grammar');
  $$('#viewSwitch button').forEach(button => {
    const on = button.dataset.view === currentView;
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
  });
  hint.textContent = HINTS[currentView];
  expandAllBtn.classList.toggle('hidden', currentView !== 'grammar');
  applyFilters();
}

function applyFilters() {
  const query = search.value.trim().toLowerCase();
  const root = viewRoot();
  let anyVisible = false;

  $$('section.lesson', root).forEach(section => {
    if (activeLesson !== 'all' && section.dataset.lesson !== activeLesson) {
      section.classList.add('hidden');
      return;
    }

    let sectionHasMatch = false;
    $$('[data-search]', section).forEach(card => {
      const hit = !query || card.dataset.search.includes(query);
      card.classList.toggle('hidden', !hit);
      if (hit) sectionHasMatch = true;
    });

    // Hide a theme heading and its grid together once every card inside is filtered out.
    $$('.grid', section).forEach(grid => {
      const hasVisibleCard = $$('.vcard', grid).some(card => !card.classList.contains('hidden'));
      grid.classList.toggle('hidden', !hasVisibleCard);
      const heading = grid.previousElementSibling;
      if (heading?.classList.contains('theme')) heading.classList.toggle('hidden', !hasVisibleCard);
    });

    section.classList.toggle('hidden', !sectionHasMatch);
    if (sectionHasMatch) anyVisible = true;
  });

  $('.noresult', root)?.classList.toggle('hidden', anyVisible);
  highlight(query, root);
  syncExpandAll();
}

function highlight(query, root) {
  // Unwrap previous highlights everywhere — the hidden view may still hold stale ones.
  $$('mark').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
  if (!query) return;

  const matcher = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  $$('.vcard:not(.hidden), .gcard:not(.hidden), .gpoint:not(.hidden)', root)
    .forEach(card => markMatches(card, matcher));
}

/* Grammar rows on screen: not filtered out by search, and not in a hidden lesson. */
const visibleGrammarPoints = () => $$('.gpoint', grammarList).filter(point =>
  !point.classList.contains('hidden') && !point.closest('section.lesson').classList.contains('hidden'));

/* The expand-all button offers whichever action applies to the rows on screen. */
function syncExpandAll() {
  const points = visibleGrammarPoints();
  const allOpen = points.length > 0 && points.every(point => point.open);
  expandAllBtn.textContent = allOpen ? '모두 접기 · Collapse all' : '모두 펼치기 · Expand all';
}

function markMatches(node, matcher) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) {
      // String.replace restarts each call, unlike RegExp.test, whose lastIndex
      // would carry between sibling nodes and skip matches.
      const marked = child.textContent.replace(matcher, '<mark>$1</mark>');
      if (marked === child.textContent) continue;
      const holder = document.createElement('span');
      holder.innerHTML = marked;
      child.replaceWith(...holder.childNodes);
    } else if (child.nodeType === Node.ELEMENT_NODE && !['MARK', 'TABLE'].includes(child.tagName)) {
      markMatches(child, matcher);
    }
  }
}

/* ---------- flashcard review ---------- */
const overlay      = $('#overlay');
const fcBody       = $('#fcBody');
const fcMeta       = $('#fcMeta');
const fcControls   = $('#fcControls');
const fcMark       = $('#fcMark');
const fcBar        = $('#fcBar');
const fcPrevBtn    = $('#fcPrev');
const fcNextBtn    = $('#fcNext');
const fcFlipBtn    = $('#fcFlip');
const fcDirBtn     = $('#fcDir');
const fcLearnBtn   = $('#fcLearn');
const fcUnlearnBtn = $('#fcUnlearn');
const fcIncludeChk = $('#fcInclude');

let deck = [];
let idx = 0;
let showBack = false;
let scope = 'all';
let dir = 'ko';                 // 'ko' = Korean side first, 'en' = English side first

/* ----- learned progress, persisted in the browser ----- */
const LS_KEY = 'ksi3a_learned';
let learned = loadLearned();

function loadLearned() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveLearned() {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...learned])); }
  catch { /* private mode or quota exceeded — progress just won't persist */ }
}

const cardId    = card => `${card.lesson}|${card.kw}`;
const isLearned = card => learned.has(cardId(card));

function refreshBadges() {
  $$('.vcard').forEach(el => el.classList.toggle('is-learned', learned.has(el.dataset.id)));
}

/* Every vocabulary card in scope, flattened; `lesson` here is the display label
   so it matches the data-id written by renderVocabCard. */
function cardsInScope(lessonScope) {
  return LESSONS
    .filter(lesson => lessonScope === 'all' || lesson.lesson === lessonScope)
    .flatMap(lesson => lesson.vocab.flatMap(group =>
      group.items.map(item => ({ ...item, lesson: lesson.num, theme: group.theme }))
    ));
}

/* The review deck: everything in scope, minus learned cards unless included. */
function buildDeck(lessonScope) {
  const cards = cardsInScope(lessonScope);
  return fcIncludeChk.checked ? cards : cards.filter(card => !isLearned(card));
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function startReview() {
  deck = buildDeck(scope);
  idx = 0;
  showBack = false;
  overlay.classList.add('on');
  renderCard();
}

const setControlsVisible = visible => {
  const value = visible ? 'visible' : 'hidden';
  fcControls.style.visibility = value;
  fcMark.style.visibility = value;
};

function cardFaces(card) {
  const korean  = `<div class="side-label">Korean</div><div class="big">${esc(card.kw)}</div>`;
  const meaning = `<div class="side-label">Meaning</div><div class="mean2">${esc(card.mean)}</div>`;
  const english = `<div class="side-label">English</div><div class="mean2">${esc(card.mean)}</div>`;
  const example = spaced =>
    `<div class="ex2${spaced ? ' spaced' : ''}">${esc(card.ex)}<span class="en2">${esc(card.exen)}</span></div>`;

  return dir === 'ko'
    ? { front: korean,  back: meaning + example(false) }
    : { front: english, back: korean + example(true) };
}

function renderCard() {
  // One pass over the scope covers both the counter and the progress bar.
  const scoped = cardsInScope(scope);
  const total = scoped.length;
  const learnedCount = scoped.filter(isLearned).length;

  fcBar.style.width = total ? `${(learnedCount / total) * 100}%` : '0';

  const finished = deck.length === 0 || idx >= deck.length;
  if (finished) {
    const allLearned = total > 0 && learnedCount === total;
    const [heading, detail] = deck.length === 0
      ? allLearned
        ? ['🎉 All learned!', "You've marked every card as learned. Reset to review them again."]
        : ['No cards', 'No cards in this selection. Try "Include learned" or Reset.']
      : ['🎉 Round done!',
         `You went through ${deck.length} card${deck.length > 1 ? 's' : ''}. Learned ${learnedCount} of ${total} total.`];

    fcBody.innerHTML = `<div class="fc-done"><h3>${heading}</h3><p>${esc(detail)}</p></div>`;
    fcMeta.textContent = `Learned ${learnedCount} / ${total}`;
    setControlsVisible(false);
    return;
  }

  setControlsVisible(true);

  const card = deck[idx];
  const done = isLearned(card);
  const { front, back } = cardFaces(card);
  const status = done
    ? '<div class="fc-status yes">✓ learned</div>'
    : '<div class="fc-status no">still learning</div>';
  const flipHint = showBack ? '' : '<div class="tapflip">tap card to flip</div>';

  fcMeta.textContent = `${card.lesson} · ${idx + 1}/${deck.length} · learned ${learnedCount}/${total}`;
  fcBody.innerHTML =
    `<div class="fc-card ${done ? 'learned-card' : ''}" id="fcCard">
       ${showBack ? back : front}${status}${flipHint}
     </div>`;
  $('#fcCard').addEventListener('click', flipCard);

  fcPrevBtn.disabled = idx === 0;
  fcFlipBtn.textContent = showBack ? 'Hide' : 'Flip';
  fcLearnBtn.textContent = done ? '✓ Learned' : '✓ Got it — learned';
  fcUnlearnBtn.style.display = done ? 'block' : 'none';
}

function flipCard() {
  showBack = !showBack;
  renderCard();
}

function goToCard(nextIdx) {
  if (nextIdx < 0) return;
  idx = nextIdx;
  showBack = false;
  renderCard();
}

function markLearned() {
  const card = deck[idx];
  if (!card) return;

  learned.add(cardId(card));
  saveLearned();
  refreshBadges();

  if (fcIncludeChk.checked) {
    renderCard();               // keep the card in view, just flip its status
  } else {
    deck.splice(idx, 1);        // drop it from this round; idx now points at the next card
    showBack = false;
    renderCard();
  }
}

function markUnlearned() {
  const card = deck[idx];
  if (!card) return;
  learned.delete(cardId(card));
  saveLearned();
  refreshBadges();
  renderCard();
}

function setScope(nextScope) {
  scope = nextScope;
  $$('#fcScope button').forEach(button => button.classList.toggle('on', button.dataset.scope === scope));
  startReview();
}

/* ---------- event wiring ---------- */
tabs.addEventListener('click', event => {
  if (!event.target.classList.contains('tab')) return;
  $$('.tab', tabs).forEach(tab => tab.classList.remove('active'));
  event.target.classList.add('active');
  activeLesson = event.target.dataset.lesson;
  applyFilters();
});

search.addEventListener('input', applyFilters);

enToggle.addEventListener('change', () => {
  $('.wrap').classList.toggle('en-hide', !enToggle.checked);
});

// Click a vocabulary card in the list to hide/reveal its answer.
content.addEventListener('click', event => {
  event.target.closest('.vcard')?.classList.toggle('flip');
});

// View switch: the full lesson view, or grammar points only.
$('#viewSwitch').addEventListener('click', event => {
  const button = event.target.closest('button[data-view]');
  if (button) setView(button.dataset.view);
});

expandAllBtn.addEventListener('click', () => {
  const points = visibleGrammarPoints();
  const open = points.some(point => !point.open);
  points.forEach(point => { point.open = open; });
  syncExpandAll();
});

// `toggle` doesn't bubble, so listen in the capture phase to hear every row.
grammarList.addEventListener('toggle', syncExpandAll, true);

$('#fcStart').addEventListener('click', () => setScope(activeLesson));
$('#fcScope').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button) setScope(button.dataset.scope);
});

$('#fcClose').addEventListener('click', () => overlay.classList.remove('on'));
overlay.addEventListener('click', event => {
  if (event.target === overlay) overlay.classList.remove('on');
});

fcFlipBtn.addEventListener('click', flipCard);
fcNextBtn.addEventListener('click', () => goToCard(idx + 1));
fcPrevBtn.addEventListener('click', () => goToCard(idx - 1));
fcLearnBtn.addEventListener('click', markLearned);
fcUnlearnBtn.addEventListener('click', markUnlearned);
fcIncludeChk.addEventListener('change', startReview);   // deck contents depend on this

$('#fcShuffle').addEventListener('click', () => {
  shuffle(deck);
  goToCard(0);
});

$('#fcReset').addEventListener('click', () => {
  if (!confirm('Reset progress? All cards will go back into the deck.')) return;
  learned.clear();
  saveLearned();
  refreshBadges();
  startReview();
});

fcDirBtn.addEventListener('click', () => {
  dir = dir === 'ko' ? 'en' : 'ko';
  fcDirBtn.textContent = dir === 'ko' ? '한 → EN' : 'EN → 한';
  showBack = false;
  renderCard();
});

// Arrows navigate, space flips, escape closes — only while the overlay is open.
document.addEventListener('keydown', event => {
  if (!overlay.classList.contains('on')) return;
  if (event.key === 'Escape') overlay.classList.remove('on');
  else if (event.key === 'ArrowRight') goToCard(idx + 1);
  else if (event.key === 'ArrowLeft') goToCard(idx - 1);
  else if (event.key === ' ') { event.preventDefault(); flipCard(); }
});

/* ---------- interface for quiz.js ----------
   quiz.js is a separate classic script loaded after this one. Everything it may
   use is listed here explicitly, so the coupling between the two files is a
   single documented surface rather than a set of incidental globals.
   `lessons:loaded` fires on document once the lesson JSON has rendered. */
window.KSI = {
  esc,
  $, $$,
  cardsInScope,               // (scope) => flattened vocabulary cards, learned or not
  activeLesson: () => activeLesson,
  isLearned,
};

loadLessons();
