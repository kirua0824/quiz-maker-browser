import fs from "node:fs";

const problemJson = "/private/tmp/geography1_problem_all.json";
const answerJson = "/private/tmp/geography1_answer_all.json";
const outputMd = "data/decks/geography1.md";

const problemLines = JSON.parse(fs.readFileSync(problemJson, "utf8"));
const answerLines = JSON.parse(fs.readFileSync(answerJson, "utf8"));

function cleanText(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/^[口■□ロL_0１1\s]+(?=（|\()/, "")
    .replace(/4P/g, "→P")
    .trim();
}

function rowsForPage(lines, page, { minX = -1, maxX = 2 } = {}) {
  const pageLines = lines
    .filter((line) => line.page === page && line.x >= minX && line.x < maxX)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const rows = [];
  for (const line of pageLines) {
    const y = line.y;
    const previous = rows[rows.length - 1];
    if (previous && Math.abs(previous.y - y) < 0.008) {
      previous.parts.push(line);
      previous.y = (previous.y + y) / 2;
    } else {
      rows.push({ y, parts: [line] });
    }
  }

  return rows.map((row) => ({
    y: row.y,
    text: cleanText(row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ")),
  })).filter((row) => row.text);
}

function parseLeadingNumber(text, previousNumber) {
  const normalized = text
    .replace(/^[_\s口■□ロL]+/, "")
    .replace(/^0(?=（|\()/, "")
    .trim();
  const match = normalized.match(/^[（(]\s*(\d{1,2})\s*[）)]?\s*(.*)$/);
  if (!match) return null;

  let number = Number(match[1]);
  if (number === 0 && previousNumber >= 9) number = 10;
  if (number <= previousNumber && previousNumber >= 9) number += 10;
  return {
    number,
    body: cleanText(match[2]),
  };
}

function extractProblemQuestions() {
  const pages = [...new Set(problemLines.map((line) => line.page))].sort((a, b) => a - b);
  const byPage = new Map();

  for (const page of pages) {
    const rows = rowsForPage(problemLines, page, { maxX: 0.67 });
    const headingIndex = rows.findIndex((row) => /一問一答|礎力UP|基礎力U/.test(row.text));
    if (headingIndex === -1) continue;

    const questions = [];
    let current = null;
    let previousNumber = 0;

    for (const row of rows.slice(headingIndex + 1)) {
      let text = cleanText(row.text);
      if (!text || /^M\s*地|^地I$|^\d+$/.test(text)) continue;
      if (/^＞|^>/.test(text)) continue;

      const numbered = parseLeadingNumber(text, previousNumber);
      if (numbered) {
        if (current) questions.push(current);
        current = {
          number: numbered.number,
          question: numbered.body,
        };
        previousNumber = numbered.number;
        continue;
      }

      if (current && !/^\(?\d{1,2}\)?$/.test(text) && !/^\[/.test(text)) {
        current.question = cleanText(`${current.question} ${text}`);
      }
    }

    if (current) questions.push(current);

    const cleaned = questions
      .map((item) => ({
        ...item,
        question: cleanQuestion(item.question),
      }))
      .filter((item) => item.question.length >= 8);

    if (cleaned.length) byPage.set(page, cleaned);
  }

  return byPage;
}

function cleanQuestion(question) {
  return cleanText(question)
    .replace(/（\d+）$/g, "")
    .replace(/^\d+礎力UP[：:、，]?\s*/, "")
    .replace(/^一問一答\s*/, "")
    .replace(/^[;；]\s*/, "")
    .trim();
}

function splitAnswerFragments(text) {
  const normalized = cleanText(text)
    .replace(/①/g, "(1)")
    .replace(/②/g, "(2)")
    .replace(/③/g, "(3)")
    .replace(/④/g, "(4)")
    .replace(/⑤/g, "(5)")
    .replace(/⑥/g, "(6)")
    .replace(/⑦/g, "(7)")
    .replace(/⑧/g, "(8)")
    .replace(/⑨/g, "(9)")
    .replace(/⑩/g, "(10)");

  const fragments = [];
  const pattern = /[（(]\s*(\d{1,2})\s*[）)]?\s*([^（(]+?)(?=\s*[（(]\s*\d{1,2}\s*[）)]?|$)/g;
  let match;
  while ((match = pattern.exec(normalized))) {
    const answer = cleanAnswer(match[2]);
    if (answer) fragments.push({ number: Number(match[1]), answer });
  }
  return fragments;
}

function cleanAnswer(answer) {
  return cleanText(answer)
    .replace(/^[:：、，.．]/, "")
    .replace(/→\s*P\.?\s*\d+.*/g, "")
    .replace(/^[^ぁ-んァ-ン一-龥A-Za-z0-9０-９]+/, "")
    .trim();
}

function extractAnswers() {
  const pages = [...new Set(answerLines.map((line) => line.page))].sort((a, b) => a - b);
  const answersByTargetPage = new Map();

  for (const page of pages) {
    for (const column of [
      rowsForPage(answerLines, page, { minX: -1, maxX: 0.5 }),
      rowsForPage(answerLines, page, { minX: 0.5, maxX: 2 }),
    ]) {
      for (let index = 0; index < column.length; index += 1) {
        const row = column[index];
        if (!/一問一答|礎力UP/.test(row.text)) continue;

        const lookahead = column.slice(index, index + 4).map((item) => item.text).join(" ");
        const targetMatch = lookahead.match(/[PＰ]\.?\s*(\d{1,3})/i);
        if (!targetMatch) continue;

        const targetPage = Number(targetMatch[1]);
        const answers = [];
        let misses = 0;
        let previousNumber = 0;

        for (const item of column.slice(index + 1)) {
          const text = item.text;
          if (text === row.text) continue;
          if (/穴うめ|要点確認|単元別|定期テスト|一問一答|礎力UP/.test(text) && answers.length) break;
          if (/^[①②③④⑤⑥⑦⑧⑨]\s*(?:$|（|\()/.test(text) && answers.length) break;

          const fragments = splitAnswerFragments(text);
          if (fragments.length) {
            for (const fragment of fragments) {
              let number = fragment.number;
              if (number === 0 && previousNumber >= 9) number = 10;
              if (number <= previousNumber && previousNumber >= 9) number += 10;
              answers.push({ ...fragment, number });
              previousNumber = number;
            }
            misses = 0;
          } else if (answers.length) {
            misses += 1;
            if (misses >= 2) break;
          }
        }

        if (answers.length) answersByTargetPage.set(targetPage, answers);
      }
    }
  }

  return answersByTargetPage;
}

function makeCards(questionsByPage, answersByPage) {
  const cards = [];

  for (const [page, questions] of questionsByPage.entries()) {
    const answers = answersByPage.get(page);
    if (!answers) continue;

    const answerByNumber = new Map();
    for (const answer of answers) {
      if (!answerByNumber.has(answer.number)) answerByNumber.set(answer.number, answer.answer);
    }
    const genre = inferGenre(page);

    for (const question of questions) {
      const answer = answerByNumber.get(question.number);
      if (!answer) continue;
      if (isSuspectCard(question.question, answer)) continue;
      cards.push({
        page,
        genre,
        question: question.question,
        answer,
      });
    }
  }

  return cards;
}

function isSuspectCard(question, answer) {
  if (/[コ」］]\s*[（(]\d/.test(question)) return true;
  if (/[（(]\d{1,2}[）)]?\s+[^|。]+[（(]\d{1,2}/.test(question)) return true;
  if (/\s\d{1,2}[ぁ-んァ-ン一-龥]/.test(answer)) return true;
  if (answer.length > 30 && /[（(]\d/.test(answer)) return true;
  return false;
}

function inferGenre(page) {
  if (page <= 11) return "世界の姿";
  if (page <= 21) return "日本の姿";
  if (page <= 35) return "人々の生活と環境";
  if (page <= 49) return "世界の諸地域1";
  if (page <= 63) return "世界の諸地域2";
  if (page <= 77) return "世界の諸地域3";
  return "地域調査・資料活用";
}

function toMarkdown(cards) {
  const grouped = new Map();
  for (const card of cards) {
    if (!grouped.has(card.genre)) grouped.set(card.genre, []);
    grouped.get(card.genre).push(card);
  }

  const lines = [
    "<!-- generated from OCR: geography1 problem/answer PDFs -->",
    "",
  ];

  for (const [genre, items] of grouped.entries()) {
    lines.push(`# ${genre}`);
    for (const item of items) {
      lines.push(`${item.question} | ${item.answer}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

const questionsByPage = extractProblemQuestions();
const answersByPage = extractAnswers();
const cards = makeCards(questionsByPage, answersByPage);

fs.writeFileSync(outputMd, toMarkdown(cards));
console.log(JSON.stringify({
  questionPages: questionsByPage.size,
  answerPages: answersByPage.size,
  cards: cards.length,
  outputMd,
  sample: cards.slice(0, 8),
}, null, 2));
