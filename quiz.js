/* =============================================================
   Typed-answer quiz.

   Loaded after app.js, which exposes window.KSI (see the interface
   block at the bottom of app.js). Nothing here writes to app.js state.

   Direction:
     'ko' → shows the Korean word, you type the English meaning
     'en' → shows the English meaning, you type the Korean word

   Answer checking is deliberately forgiving, because a meaning is
   written as prose rather than as a list. See answersFor() below.
   ============================================================= */

/* Wrapped in an IIFE: classic scripts share one global scope, so declaring
   `esc`, `$`, `shuffle`, `overlay`… at top level here would collide with the
   same names in app.js and throw a SyntaxError before any of this runs. */
(() => {
'use strict';

const { esc, $, $$, cardsInScope } = window.KSI;

/* ---------- answer matching ----------

   Every answer is compared through three increasingly forgiving forms, and the
   SAME forms are applied to what the user types, so the two meet in the middle:

     normalize  lowercase, tidy whitespace           "To be lively." -> "to be lively"
     canonical  drop brackets, leading to/be/a       -> "lively"
     loose      fold punctuation, spelling, endings  -> "live"

   A match on any form counts. This is deliberately generous: a meaning is
   written as prose rather than as a list, so asking for it back word for word
   would mark people wrong who actually know the word. */

/* Lowercase, drop trailing punctuation, collapse whitespace. */
const normalize = text =>
  String(text ?? '').toLowerCase().replace(/[.!?]+$/g, '').replace(/\s+/g, ' ').trim();

/* Drop parenthetical qualifiers and any leading "to", "be", "have" and articles,
   so "to be lively", "be lively" and "lively" all reduce to the same thing,
   "to be a waste (of money)" reduces to "waste", and "to have a sense of humour"
   reduces to "sense of humour". */
const canonical = text =>
  normalize(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(?:(?:to|be|have|a|an|the)\s+)+/, '')
    .replace(/\s+/g, ' ')
    .trim();

/* Words whose final "-our" is part of the word rather than the British spelling
   of "-or", so "flour" is not folded to "flor". */
const OUR_IS_NOT_A_SUFFIX = /^(?:our|four|flour|hour|your|sour|tour|pour|dour|scour|devour)$/;

/* Filler that carries no meaning on its own, so "to do one's best" also matches
   "do your best" and "sad to see (someone) go" matches "sad to see go". */
const FILLER = /^(?:ones|oneself|self|someone|somebody|something|myself|my|your|yours|his|her|hers|their|theirs|its)$/;

/* Fold one word to a rough stem: British spelling to American, plural to
   singular, -ing/-ed off the end. Rough is fine, because the same folding is
   applied to the expected answer and to what was typed, so both land together. */
function stemWord(word) {
  let stem = word;
  if (!OUR_IS_NOT_A_SUFFIX.test(stem)) stem = stem.replace(/our$/, 'or');   // humour -> humor
  stem = stem.replace(/ise$/, 'ize').replace(/yse$/, 'yze');                // realise -> realize
  if (stem.length > 4) stem = stem.replace(/ies$/, 'y').replace(/(?:ing|ed)$/, '');
  if (stem.length > 3) {
    stem = stem.replace(/(?:sses|shes|ches|xes)$/, match => match.slice(0, -2))
               .replace(/([^s])s$/, '$1');                                  // jokes -> joke
  }
  if (stem.length > 3) stem = stem.replace(/e$/, '');                       // excited/excite -> excit
  return stem;
}

/* Hangul, so a Korean answer can also be matched with the spacing left out:
   Korean spacing trips up learners who know the word perfectly well. */
const HAS_HANGUL = /[ㄱ-ㆎ가-힣]/;

/* The most forgiving form: canonical, minus punctuation, hyphens and filler
   words, with every remaining word stemmed. "clean-cut" -> "clean cut". */
const loose = text =>
  canonical(text)
    .replace(/['‘’]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(word => word && !FILLER.test(word))
    .map(stemWord)
    .join(' ')
    .trim();

/* The forms a piece of text is accepted as. Used on both sides of the check. */
function bothForms(text) {
  const forms = [normalize(text), canonical(text), loose(text)];
  if (HAS_HANGUL.test(text)) forms.push(normalize(text).replace(/\s+/g, ''));
  return [...new Set(forms.filter(Boolean))];
}

/* Split on the separators that fall OUTSIDE brackets. Bracketed text is passed
   over, so "to wear, tie (a necktie, scarf)" splits into two meanings rather
   than three, and "기대(하다/되다)" stays in one piece. */
function splitOutsideBrackets(text, separators) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of String(text ?? '')) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && separators.includes(ch)) { parts.push(current); current = ''; }
    else current += ch;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

/* A meaning like "to join, sign up" or "to wear, tie (a necktie, scarf)" holds
   several acceptable answers; any single one counts as correct. */
function englishAnswers(meaning) {
  const answers = new Set(bothForms(meaning));            // the whole string, as written
  for (const piece of splitOutsideBrackets(meaning, ',;/')) {
    for (const part of piece.split(' or ')) {
      bothForms(part).forEach(form => answers.add(form));

      /* Brackets usually list what the word applies to, and naming one of them
         is a fair answer: "to wear (a watch, bracelet)" is also answered as
         "wear a watch", and "(fried) chicken" as "fried chicken". Either order,
         since the brackets may come before or after the meaning. */
      const withoutBrackets = part.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      const inBrackets = part.match(/\(([^)]*)\)/)?.[1] ?? '';
      for (const option of inBrackets.split(/[,/]/)) {
        const listed = option.trim();
        if (!listed || !withoutBrackets) continue;
        bothForms(`${withoutBrackets} ${listed}`).forEach(form => answers.add(form));
        bothForms(`${listed} ${withoutBrackets}`).forEach(form => answers.add(form));
      }
    }
  }
  return [...answers];
}

/* A slash outside brackets separates alternative words ("휴대 전화/휴대폰");
   inside brackets it separates alternative endings (기대(하다/되다)), handled below. */
const splitAlternatives = word => splitOutsideBrackets(word, '/');

/* A bracketed part is optional, and may offer alternative endings:
     가입(하다)      -> 가입, 가입하다
     기대(하다/되다)  -> 기대, 기대하다, 기대되다
     (돈이) 아깝다   -> 아깝다, 돈이 아깝다
   The form as written is accepted too, and so is either word of "휴대 전화/휴대폰". */
function koreanAnswers(word) {
  const answers = new Set(bothForms(word));
  for (const alternative of splitAlternatives(word)) {
    bothForms(alternative).forEach(form => answers.add(form));
    bothForms(alternative.replace(/[()]/g, '')).forEach(form => answers.add(form));

    const stem = alternative.replace(/\([^)]*\)/g, '').trim();
    bothForms(stem).forEach(form => answers.add(form));

    const endings = alternative.match(/\(([^)]*)\)/)?.[1] ?? '';
    for (const ending of endings.split('/')) {
      const suffix = ending.trim();
      if (suffix) bothForms(stem + suffix).forEach(form => answers.add(form));
    }
  }
  return [...answers];
}

const answersFor = (card, direction) =>
  direction === 'ko' ? englishAnswers(card.mean) : koreanAnswers(card.kw);

const isCorrect = (typed, answers) => bothForms(typed).some(form => answers.includes(form));

/* ---------- state ---------- */
const overlay   = $('#quizOverlay');
const qMeta     = $('#qzMeta');
const qBar      = $('#qzBar');
const qPrompt   = $('#qzPrompt');
const qInput    = $('#qzInput');
const qCheckBtn = $('#qzCheck');
const qNextBtn  = $('#qzNext');
const qSkipBtn  = $('#qzSkip');
const qFeedback = $('#qzFeedback');
const qDirBtn   = $('#qzDir');

let questions = [];
let qIdx = 0;
let score = 0;
let answered = false;
let scope = 'all';
let direction = 'ko';
let results = [];          // one entry per answered question, for the end-of-quiz summary

const shuffle = items => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

/* ---------- rendering ---------- */

function startQuiz() {
  // Vocabulary groups marked quiz: false (whole phrases) stay out of the typed quiz.
  questions = shuffle(cardsInScope(scope).filter(card => card.quiz));
  qIdx = 0;
  score = 0;
  results = [];
  overlay.classList.add('on');
  $('#qzScope button.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  renderQuestion();
}

function setStage(stage) {          // 'asking' | 'answered' | 'done'
  qCheckBtn.classList.toggle('hidden', stage !== 'asking');
  qSkipBtn.classList.toggle('hidden', stage !== 'asking');
  qNextBtn.classList.toggle('hidden', stage !== 'answered');
  qInput.classList.toggle('hidden', stage === 'done');
  // readOnly rather than disabled: a disabled input fires no keydown, and Enter
  // needs to keep working here to move to the next question.
  qInput.readOnly = stage !== 'asking';
  qInput.classList.toggle('locked', stage !== 'asking');
}

function renderQuestion() {
  const total = questions.length;
  qBar.style.width = total ? `${(qIdx / total) * 100}%` : '0';

  if (qIdx >= total) {
    const perfect = total > 0 && score === total;
    qMeta.textContent = `Score ${score} / ${total}`;
    qPrompt.innerHTML =
      `<div class="qz-done">
         <h3>${perfect ? '🎉 Perfect!' : 'Quiz complete'}</h3>
         <p>You got ${score} of ${results.length} right.</p>
       </div>`;
    qFeedback.className = 'qz-feedback';
    qFeedback.innerHTML = renderSummary();
    setStage('done');
    return;
  }

  const card = questions[qIdx];
  qMeta.textContent = `${card.lesson} · ${qIdx + 1}/${total} · score ${score}`;

  const promptText = direction === 'ko' ? card.kw : card.mean;
  const askLabel = direction === 'ko' ? 'Type the meaning in English' : 'Type the word in Korean';

  qPrompt.innerHTML =
    `<div class="qz-side">${direction === 'ko' ? 'Korean' : 'English'}</div>
     <div class="qz-word">${esc(promptText)}</div>
     <div class="qz-ask">${esc(askLabel)}</div>`;

  qFeedback.className = 'qz-feedback';
  qFeedback.textContent = '';
  qInput.value = '';
  qInput.placeholder = direction === 'ko' ? 'your answer in English…' : '한국어로 답을 쓰세요…';
  answered = false;
  setStage('asking');
  qInput.focus();
}

/* End-of-quiz review: every question in the order asked, marked right or wrong,
   with what was typed whenever it didn't count. */
function renderSummary() {
  if (!results.length) return '';

  const rows = results.map(({ card, typed, correct, skipped }) => {
    const mark = correct ? '✓' : skipped ? '–' : '✗';
    const note = correct
      ? ''
      : skipped
        ? '<span class="qz-row-note">skipped</span>'
        : `<span class="qz-row-note">you wrote “${esc(typed)}”</span>`;

    return `
      <li class="qz-row ${correct ? 'ok' : 'no'}">
        <span class="qz-row-mark">${mark}</span>
        <span class="qz-row-body">
          <span class="qz-row-kw">${esc(card.kw)}</span>
          <span class="qz-row-mean">${esc(card.mean)}</span>
          ${note}
        </span>
      </li>`;
  }).join('');

  const missed = results.filter(entry => !entry.correct).length;
  return `
    <div class="qz-summary">
      <div class="qz-summary-head">Review · ${score} right, ${missed} to work on</div>
      <ul class="qz-list">${rows}</ul>
    </div>`;
}

/* Shows the full written meaning, plus the example sentence when the word has one,
   so a wrong answer still teaches something. */
function revealAnswer(card) {
  const expected = direction === 'ko' ? card.mean : card.kw;
  const example = card.ex
    ? `<div class="qz-example">${esc(card.ex)}<span class="qz-example-en">${esc(card.exen)}</span></div>`
    : '';
  return `<div class="qz-expected">${esc(expected)}</div>${example}`;
}

function checkAnswer() {
  if (answered) return;
  const typed = qInput.value.trim();
  if (!typed) return;

  const card = questions[qIdx];
  const correct = isCorrect(typed, answersFor(card, direction));
  if (correct) score++;
  results.push({ card, typed, correct, skipped: false });

  answered = true;
  qFeedback.className = `qz-feedback ${correct ? 'right' : 'wrong'}`;
  qFeedback.innerHTML = correct
    ? `<div class="qz-verdict">✓ Correct</div>${revealAnswer(card)}`
    : `<div class="qz-verdict">✗ Not quite — you wrote “${esc(typed)}”</div>${revealAnswer(card)}`;

  qMeta.textContent = `${card.lesson} · ${qIdx + 1}/${questions.length} · score ${score}`;
  setStage('answered');
  qInput.focus();          // stay in the input so Enter moves on without reaching for the mouse
}

function skipQuestion() {
  if (answered) return;
  const card = questions[qIdx];
  results.push({ card, typed: '', correct: false, skipped: true });

  answered = true;
  qFeedback.className = 'qz-feedback wrong';
  qFeedback.innerHTML = `<div class="qz-verdict">Skipped</div>${revealAnswer(card)}`;
  setStage('answered');
  qInput.focus();
}

function nextQuestion() {
  qIdx++;
  renderQuestion();
}

function setScope(nextScope) {
  scope = nextScope;
  $$('#qzScope button').forEach(button => button.classList.toggle('on', button.dataset.scope === scope));
  startQuiz();
}

/* ---------- wiring ---------- */
$('#qzStart').addEventListener('click', () => setScope(window.KSI.activeLesson()));
$('#qzScope').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button) setScope(button.dataset.scope);
});

$('#qzClose').addEventListener('click', () => overlay.classList.remove('on'));
overlay.addEventListener('click', event => {
  if (event.target === overlay) overlay.classList.remove('on');
});

qCheckBtn.addEventListener('click', checkAnswer);
qNextBtn.addEventListener('click', nextQuestion);
qSkipBtn.addEventListener('click', skipQuestion);
$('#qzRestart').addEventListener('click', startQuiz);

qDirBtn.addEventListener('click', () => {
  direction = direction === 'ko' ? 'en' : 'ko';
  qDirBtn.textContent = direction === 'ko' ? '한 → EN' : 'EN → 한';
  startQuiz();
});

/* Enter checks, then Enter again moves on — one physical press, one action.
   Two things used to turn a single press into "check AND skip past the feedback":
   - Typing Korean. Enter pressed while a syllable is still being composed arrives
     flagged isComposing, and Chrome then sends a second, ordinary Enter keydown for
     the same press. So a composing Enter waits for the IME to commit the syllable
     (compositionend) and acts then — which also guarantees the last syllable is in
     the answer.
   - Holding the key, which repeats keydown.
   So after acting, Enter stays disarmed until the key is released. */
let enterArmed = true;             // false from an Enter that acted until its keyup
let enterWhileComposing = false;   // Enter pressed mid-syllable; act once it's committed

function onEnter() {
  if (!enterArmed) return;
  enterArmed = false;
  if (answered) nextQuestion(); else checkAnswer();
}

qInput.addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.stopPropagation();
  if (event.isComposing) { enterWhileComposing = true; return; }   // let the IME finish first
  event.preventDefault();
  onEnter();
});

qInput.addEventListener('compositionend', () => {
  if (!enterWhileComposing) return;
  enterWhileComposing = false;
  onEnter();
});

// Listened for on document: by the time the key comes up the input may be hidden.
document.addEventListener('keyup', event => {
  if (event.key !== 'Enter') return;
  enterArmed = true;
  enterWhileComposing = false;
});

document.addEventListener('keydown', event => {
  if (!overlay.classList.contains('on')) return;
  if (event.key === 'Escape') { overlay.classList.remove('on'); return; }
  // Fallback for when focus has left the input. A focused button already turns
  // Enter into its own click, so acting here too would do two things at once.
  if (event.key === 'Enter' && event.target !== qInput && !event.target.closest('button')) {
    event.preventDefault();
    onEnter();
  }
});

})();
