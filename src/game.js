const STORAGE_KEY = "quiz-maker-text-v1";
const BEST_KEY = "quiz-maker-best-v1";
const QUIZ_LIMIT = 10;
const ALL_GENRES = "__all__";
const DEFAULT_GENRE = "未分類";
const FALLBACK_DECKS = [
  {
    id: "history1",
    title: "歴史I",
    badge: "社会",
    description: "歴史のとらえ方から織田信長・豊臣秀吉まで",
    status: "ready",
    sourceType: "local-md",
    deckPath: "./data/decks/history1.md",
  },
];
let decks = FALLBACK_DECKS;

const appConfig = window.QUIZ_APP_CONFIG || {};

const ui = {
  source: document.querySelector("#quizSource"),
  bestScore: document.querySelector("#bestScore"),
  deckCards: document.querySelector("#deckCards"),
  deckStatus: document.querySelector("#deckStatus"),
  startButton: document.querySelector("#startButton"),
  genreMode: document.querySelector("#genreMode"),
  orderMode: document.querySelector("#orderMode"),
  timeMode: document.querySelector("#timeMode"),
  roundText: document.querySelector("#roundText"),
  questionCount: document.querySelector("#questionCount"),
  scoreText: document.querySelector("#scoreText"),
  streakText: document.querySelector("#streakText"),
  progressFill: document.querySelector("#progressFill"),
  quizCard: document.querySelector("#quizCard"),
  questionText: document.querySelector("#questionText"),
  answerForm: document.querySelector("#answerForm"),
  answerInput: document.querySelector("#answerInput"),
  hintButton: document.querySelector("#hintButton"),
  checkButton: document.querySelector("#checkButton"),
  feedback: document.querySelector("#feedback"),
  restartButton: document.querySelector("#restartButton"),
  nextButton: document.querySelector("#nextButton"),
  resultPanel: document.querySelector("#resultPanel"),
  resultTitle: document.querySelector("#resultTitle"),
  finalScore: document.querySelector("#finalScore"),
  finalAccuracy: document.querySelector("#finalAccuracy"),
  finalCorrect: document.querySelector("#finalCorrect"),
  finalTotal: document.querySelector("#finalTotal"),
  reviewList: document.querySelector("#reviewList"),
};

const state = {
  questions: [],
  index: 0,
  score: 0,
  streak: 0,
  correct: 0,
  checked: false,
  timerId: 0,
  duration: 0,
  remaining: 0,
  results: [],
  currentDeckId: "",
};

async function restore() {
  registerServiceWorker();
  decks = await loadDeckCatalog();
  renderDeckCards();
  const savedSource = localStorage.getItem(STORAGE_KEY);
  ui.source.value = savedSource || "";
  ui.bestScore.textContent = localStorage.getItem(BEST_KEY) || "0";
  refreshGenreOptions();
  setCurrentDeck(isStoredHistoryDeck(savedSource) ? "history1" : "");

  if (shouldUpgradeStoredHistoryDeck(savedSource)) {
    await loadHistoryDeck({ silent: true });
    showSetupMessage("小ジャンル入りの歴史Iデッキに更新しました。選んでスタートできます。");
    ui.quizCard.classList.remove("is-wrong");
  }
}

async function loadDeckCatalog() {
  const localDecks = await loadLocalCatalog();
  const supabaseDecks = await loadSupabaseCatalog();
  if (supabaseDecks.length) return mergeDeckCatalogs(supabaseDecks, localDecks);

  return localDecks;
}

async function loadLocalCatalog() {
  try {
    const response = await fetch("./data/decks/catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = await response.json();
    return Array.isArray(catalog) && catalog.length ? catalog : FALLBACK_DECKS;
  } catch {
    return FALLBACK_DECKS;
  }
}

function mergeDeckCatalogs(supabaseDecks, localDecks) {
  const localById = new Map(localDecks.map((deck) => [deck.id, deck]));
  const merged = supabaseDecks.map((deck) => {
    const localDeck = localById.get(deck.id);
    if (localDeck && localDeck.status === "ready" && deck.status !== "ready") return localDeck;
    return deck;
  });

  localDecks.forEach((deck) => {
    if (!merged.some((item) => item.id === deck.id)) merged.push(deck);
  });

  return merged;
}

function hasSupabaseConfig() {
  return Boolean(appConfig.supabaseUrl && getSupabaseKey());
}

function getSupabaseKey() {
  return appConfig.supabaseKey || appConfig.supabaseAnonKey || "";
}

async function supabaseRequest(path) {
  if (!hasSupabaseConfig()) return null;
  const baseUrl = appConfig.supabaseUrl.replace(/\/$/, "");
  const key = getSupabaseKey();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.json();
}

async function loadSupabaseCatalog() {
  try {
    const rows = await supabaseRequest(
      "quiz_decks?select=id,title,badge,description,status,source_type,sort_order&order=sort_order.asc",
    );
    if (!Array.isArray(rows) || !rows.length) return [];
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      badge: row.badge,
      description: row.description,
      status: row.status,
      sourceType: "supabase",
      deckPath: "",
    }));
  } catch {
    return [];
  }
}

async function loadSupabaseDeck(deckId) {
  const rows = await supabaseRequest(
    `quiz_cards?select=genre,question,answers,sort_order&deck_id=eq.${encodeURIComponent(deckId)}&order=sort_order.asc`,
  );
  if (!Array.isArray(rows) || !rows.length) return "";
  return rowsToMarkdown(rows);
}

function rowsToMarkdown(rows) {
  const grouped = new Map();
  rows.forEach((row) => {
    const genre = row.genre || DEFAULT_GENRE;
    if (!grouped.has(genre)) grouped.set(genre, []);
    grouped.get(genre).push(row);
  });

  const lines = [];
  grouped.forEach((items, genre) => {
    lines.push(`# ${genre}`);
    items.forEach((item) => {
      const answers = Array.isArray(item.answers) ? item.answers : String(item.answers || "").split("/");
      const answerText = answers.map((answer) => String(answer).trim()).filter(Boolean).join(" / ");
      if (item.question && answerText) lines.push(`${item.question} | ${answerText}`);
    });
    lines.push("");
  });
  return lines.join("\n").trim();
}

function saveSource() {
  localStorage.setItem(STORAGE_KEY, ui.source.value);
}

function renderDeckCards() {
  ui.deckCards.innerHTML = decks.map(
    (deck) => `<button class="deckCard" type="button" data-deck-id="${deck.id}">
      <span><strong>${escapeHtml(deck.title)}</strong><span>${escapeHtml(deck.description)}</span></span>
      <em>${deck.status === "ready" ? escapeHtml(deck.badge) : "準備中"}</em>
    </button>`,
  ).join("");
}

function setCurrentDeck(deckId) {
  state.currentDeckId = deckId;
  const deck = decks.find((item) => item.id === deckId);
  ui.deckStatus.textContent = deck ? deck.title : "手入力";
  document.querySelectorAll(".deckCard").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.deckId === deckId);
  });
}

async function loadDeck(deck, { silent = false } = {}) {
  if (deck.status !== "ready") {
    ui.source.value = "";
    refreshGenreOptions();
    setCurrentDeck(deck.id);
    showSetupMessage(`${deck.title}は小テスト用データへの変換待ちです。`);
    return;
  }

  try {
    ui.source.value = deck.sourceType === "supabase"
      ? await loadSupabaseDeck(deck.id)
      : await loadLocalDeck(deck);
    if (!ui.source.value) throw new Error("empty deck");
    saveSource();
    refreshGenreOptions();
    setCurrentDeck(deck.id);
    if (!silent) {
      showSetupMessage(`${deck.title}を読み込みました。小ジャンルを選んでスタートできます。`);
      ui.quizCard.classList.remove("is-wrong");
    }
  } catch {
    showSetupMessage(`${deck.title}を読み込めませんでした。時間をおいて再読み込みしてください。`);
  }
}

async function loadLocalDeck(deck) {
  const response = await fetch(deck.deckPath, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function loadHistoryDeck(options) {
  const historyDeck = decks.find((deck) => deck.id === "history1") || FALLBACK_DECKS[0];
  if (historyDeck) await loadDeck(historyDeck, options);
}

function shouldUpgradeStoredHistoryDeck(text) {
  if (!text || hasGenreHeadings(text)) return false;
  return isStoredHistoryDeck(text);
}

function isStoredHistoryDeck(text) {
  if (!text) return false;
  return text.includes("原始と中世にはさまれた時代") && text.includes("西洋との貿易によって日本に伝えられた印刷技術");
}

function hasGenreHeadings(text) {
  return text
    .split("\n")
    .some((line) => parseGenreHeading(line.trim()));
}

function parseQuiz(text) {
  const qnaBlocks = parseQuestionAnswerBlocks(text);
  if (qnaBlocks.length) return qnaBlocks;

  const labeledLines = parseLabeledLines(text);
  if (labeledLines.length) return labeledLines;

  return parseLineQuestions(text);
}

function parseLineQuestions(text) {
  const questions = [];
  let currentGenre = DEFAULT_GENRE;

  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    const genre = parseGenreHeading(line);
    if (genre) {
      currentGenre = genre;
      return;
    }

    const item = parseLine(line, currentGenre);
    if (item) questions.push(item);
  });

  return questions;
}

function parseGenreHeading(line) {
  if (line.startsWith("#")) return line.replace(/^#+\s*/, "").trim();
  const bracketed = line.match(/^【(.+)】$/);
  if (bracketed) return bracketed[1].trim();
  return "";
}

function refreshGenreOptions() {
  const selected = ui.genreMode.value || ALL_GENRES;
  const parsed = parseQuiz(ui.source.value);
  const counts = new Map();

  parsed.forEach((question) => {
    const genre = question.category || DEFAULT_GENRE;
    counts.set(genre, (counts.get(genre) || 0) + 1);
  });

  ui.genreMode.innerHTML = "";
  ui.genreMode.append(makeGenreOption(ALL_GENRES, `すべて（${parsed.length}問）`));

  [...counts.entries()].forEach(([genre, count]) => {
    ui.genreMode.append(makeGenreOption(genre, `${genre}（${count}問）`));
  });

  ui.genreMode.value = [...ui.genreMode.options].some((option) => option.value === selected) ? selected : ALL_GENRES;
}

function makeGenreOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function parsePlainLines(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseLine(line))
    .filter(Boolean);
}

function parseLabeledLines(text) {
  const questions = [];
  let pendingQuestion = "";

  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (/^(q|問|問題)\s*[:：]/i.test(line)) {
        pendingQuestion = stripLabel(line);
        return;
      }

      if (/^(a|答|回答|答え)\s*[:：]/i.test(line) && pendingQuestion) {
        const item = makeQuestion(pendingQuestion, stripLabel(line));
        if (item) questions.push(item);
        pendingQuestion = "";
      }
    });

  return questions;
}

function parseQuestionAnswerBlocks(text) {
  const blocks = text.split(/\n\s*\n/);
  if (blocks.length <= 1) return [];

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const questionLine = lines.find((line) => /^(q|問|問題)\s*[:：]/i.test(line));
      const answerLine = lines.find((line) => /^(a|答|回答|答え)\s*[:：]/i.test(line));
      if (!questionLine || !answerLine) return null;
      return makeQuestion(stripLabel(questionLine), stripLabel(answerLine));
    })
    .filter(Boolean);
}

function parseLine(line, category = DEFAULT_GENRE) {
  const delimiters = ["\t", " | ", "|", "=>", "::", "＝", "=", "：", ":"];
  const delimiter = delimiters.find((mark) => line.includes(mark));
  if (!delimiter) return null;

  const index = line.indexOf(delimiter);
  const question = line.slice(0, index).trim();
  const answer = line.slice(index + delimiter.length).trim();
  return makeQuestion(question, answer, category);
}

function stripLabel(line) {
  return line.replace(/^(q|a|問|問題|答|回答|答え)\s*[:：]\s*/i, "").trim();
}

function makeQuestion(question, answerText, category = DEFAULT_GENRE) {
  if (!question || !answerText) return null;
  const answers = answerText
    .split(/\s*(?:\/|／)\s*/)
    .map((answer) => answer.trim())
    .filter(Boolean);
  if (!answers.length) return null;
  return {
    question,
    answers,
    primary: answers[0],
    category,
  };
}

function normalizeAnswer(value) {
  return value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[。、，,\.\s　"'`’‘“”「」『』（）()\[\]［］【】]/g, "");
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function startQuiz() {
  saveSource();
  const parsed = parseQuiz(ui.source.value);
  if (!parsed.length) {
    showSetupMessage("先に教材カードを選んでください。");
    return;
  }

  const selectedGenre = ui.genreMode.value;
  const pool = selectedGenre === ALL_GENRES ? parsed : parsed.filter((question) => question.category === selectedGenre);
  if (!pool.length) {
    showSetupMessage("この小ジャンルには問題がありません。別の小ジャンルを選んでください。");
    return;
  }

  const orderedQuestions = ui.orderMode.value === "shuffle" ? shuffle(pool) : pool;
  state.questions = orderedQuestions.slice(0, QUIZ_LIMIT);
  state.index = 0;
  state.score = 0;
  state.streak = 0;
  state.correct = 0;
  state.checked = false;
  state.duration = Number(ui.timeMode.value);
  state.remaining = state.duration;
  state.results = [];
  ui.resultPanel.hidden = true;
  ui.restartButton.disabled = false;
  renderQuestion();
}

function renderQuestion() {
  clearInterval(state.timerId);
  state.checked = false;
  state.remaining = state.duration;
  const current = state.questions[state.index];

  ui.quizCard.classList.remove("is-correct", "is-wrong", "pop");
  void ui.quizCard.offsetWidth;
  ui.quizCard.classList.add("pop");
  ui.roundText.textContent = `第${state.index + 1}問`;
  ui.questionCount.textContent = `全${state.questions.length}問`;
  ui.questionText.textContent = current.question;
  ui.answerInput.value = "";
  ui.answerInput.disabled = false;
  ui.hintButton.disabled = false;
  ui.checkButton.disabled = false;
  ui.nextButton.disabled = true;
  ui.feedback.innerHTML = "答えを入力して、答え合わせを押してください。";
  updateStats();
  updateProgress();

  window.setTimeout(() => ui.answerInput.focus(), 60);
  if (state.duration > 0) startTimer();
}

function startTimer() {
  state.timerId = window.setInterval(() => {
    state.remaining = Math.max(0, state.remaining - 0.25);
    updateProgress();
    if (state.remaining <= 0) {
      checkAnswer(true);
    }
  }, 250);
}

function updateProgress() {
  if (!state.questions.length) {
    ui.progressFill.style.width = "0%";
    return;
  }

  const completed = state.index / state.questions.length;
  const timeRatio = state.duration > 0 ? state.remaining / state.duration : 1;
  const questionSpan = 1 / state.questions.length;
  const width = Math.min(100, (completed + questionSpan * timeRatio) * 100);
  ui.progressFill.style.width = `${Math.max(0, width)}%`;
}

function updateStats() {
  ui.scoreText.textContent = String(state.score);
  ui.streakText.textContent = String(state.streak);
}

function checkAnswer(isTimeout = false) {
  if (state.checked || !state.questions.length) return;
  clearInterval(state.timerId);

  const current = state.questions[state.index];
  const userAnswer = ui.answerInput.value;
  const normalizedUser = normalizeAnswer(userAnswer);
  const correct = !isTimeout && current.answers.some((answer) => normalizeAnswer(answer) === normalizedUser);

  state.checked = true;
  ui.answerInput.disabled = true;
  ui.hintButton.disabled = true;
  ui.checkButton.disabled = true;
  ui.nextButton.disabled = false;

  if (correct) {
    state.correct += 1;
    state.streak += 1;
    const bonus = Math.max(0, state.streak - 1) * 20;
    state.score += 100 + bonus;
    ui.quizCard.classList.add("is-correct");
    ui.feedback.innerHTML = `<span class="correct">正解！</span> <strong>${escapeHtml(current.primary)}</strong> です。${bonus ? `連続正解ボーナス +${bonus}点。` : ""}`;
  } else {
    state.streak = 0;
    ui.quizCard.classList.add("is-wrong");
    ui.feedback.innerHTML = `<span class="wrong">${isTimeout ? "時間切れ" : "不正解"}</span> 正解は <strong>${escapeHtml(current.primary)}</strong> です。`;
  }

  state.results.push({
    question: current.question,
    answer: current.primary,
    user: isTimeout ? "時間切れ" : userAnswer || "未回答",
    correct,
  });

  updateStats();
  updateProgressAfterCheck();

  if (state.index === state.questions.length - 1) {
    ui.nextButton.textContent = "結果を見る";
  } else {
    ui.nextButton.textContent = "次の問題";
  }
}

function updateProgressAfterCheck() {
  const completed = (state.index + 1) / state.questions.length;
  ui.progressFill.style.width = `${Math.min(100, completed * 100)}%`;
}

function nextQuestion() {
  if (!state.checked) return;
  if (state.index >= state.questions.length - 1) {
    showResults();
    return;
  }
  state.index += 1;
  renderQuestion();
}

function showHint() {
  const current = state.questions[state.index];
  if (!current) return;
  const answer = current.primary;
  const first = answer.slice(0, 1);
  const lengthText = Array.from(answer).length;
  ui.feedback.innerHTML = `ヒント：答えは <strong>${lengthText}</strong> 文字。最初の文字は <strong>${escapeHtml(first)}</strong> です。`;
}

function showResults() {
  clearInterval(state.timerId);
  ui.answerInput.disabled = true;
  ui.hintButton.disabled = true;
  ui.checkButton.disabled = true;
  ui.nextButton.disabled = true;
  ui.resultPanel.hidden = false;
  ui.roundText.textContent = "終了";
  ui.questionText.textContent = "結果を確認して、もう一度挑戦できます。";
  ui.feedback.innerHTML = "教材カードや小ジャンルを変えると、新しい小テストを作れます。";

  const total = state.questions.length;
  const accuracy = Math.round((state.correct / total) * 100);
  ui.finalScore.textContent = String(state.score);
  ui.finalAccuracy.textContent = String(accuracy);
  ui.finalCorrect.textContent = String(state.correct);
  ui.finalTotal.textContent = String(total);
  ui.resultTitle.textContent = makeResultTitle(accuracy);

  const best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (state.score > best) {
    localStorage.setItem(BEST_KEY, String(state.score));
    ui.bestScore.textContent = String(state.score);
  }

  ui.reviewList.innerHTML = state.results.map(renderReviewItem).join("");
}

function makeResultTitle(accuracy) {
  if (accuracy === 100) return "満点クリア！";
  if (accuracy >= 80) return "かなりいい調子！";
  if (accuracy >= 50) return "あと少しで安定！";
  return "復習チャンス！";
}

function renderReviewItem(result, index) {
  const mark = result.correct ? "正解" : "復習";
  return `<article class="reviewItem">
    <p>${index + 1}. ${escapeHtml(result.question)} / ${mark}</p>
    <span>あなた：${escapeHtml(result.user)}</span>
    <span>答え：${escapeHtml(result.answer)}</span>
  </article>`;
}

function showSetupMessage(message) {
  ui.feedback.textContent = message;
  ui.quizCard.classList.remove("is-correct");
  ui.quizCard.classList.add("is-wrong");
  window.setTimeout(() => ui.quizCard.classList.remove("is-wrong"), 900);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

ui.deckCards.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-deck-id]");
  if (!card) return;
  const deck = decks.find((item) => item.id === card.dataset.deckId);
  if (deck) await loadDeck(deck);
});
ui.startButton.addEventListener("click", startQuiz);
ui.restartButton.addEventListener("click", startQuiz);
ui.nextButton.addEventListener("click", nextQuestion);
ui.hintButton.addEventListener("click", showHint);

ui.answerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  checkAnswer(false);
});

restore();
