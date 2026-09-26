const TOOL_CARDS = [
  ["resume", "▤", "peach", "Resume builder", "Turn your details into a professional first draft."],
  ["notes", "✦", "yellow", "Notes generator", "Make short, structured revision notes."],
  ["slides", "▣", "blue", "Slide maker", "Create a simple presentation in minutes."],
  ["mindmap", "⌘", "purple", "Mind map", "Connect a syllabus into visual branches."],
  ["quiz", "✓", "green", "Quiz maker", "Practise with quick multiple-choice questions."],
  ["tutor", "◌", "coral", "Ask a tutor", "Get clear explanations and examples."],
  ["flashcards", "↻", "rose", "Flashcards", "Build a deck for active recall."],
  ["planner", "▦", "indigo", "Study planner", "Make a balanced seven-day plan."],
  ["photo", "◫", "aqua", "Photo notes", "Turn a note photo into key points."],
  ["sheets", "▥", "mint", "Sheets dashboard", "Explore data from a simple sheet."],
];

const PAGE_DETAILS = {
  home: ["YOUR LEARNING SPACE", "Good morning, learner."],
  resume: ["CAREER TOOL", "Build your next opportunity."],
  notes: ["STUDY TOOL", "Make every idea easier to revise."],
  slides: ["PRESENTATION TOOL", "Explain your topic with clarity."],
  mindmap: ["VISUAL LEARNING", "Make connections at a glance."],
  quiz: ["PRACTICE TOOL", "Learn by testing yourself."],
  tutor: ["YOUR STUDY BUDDY", "A helpful explanation is one question away."],
  flashcards: ["REVISION TOOL", "Remember more with active recall."],
  planner: ["ORGANIZE YOUR WEEK", "A little structure goes a long way."],
  photo: ["PHOTO TO NOTES", "Bring your paper notes into focus."],
  sheets: ["SIMPLE DATA TOOL", "See progress without the clutter."],
};

const state = {
  apiKey: sessionStorage.getItem("studymate-api-key") || "",
  model: sessionStorage.getItem("studymate-model") || "gemini-3.6-flash",
  slides: [],
  slideIndex: 0,
  flashcards: [],
  cardIndex: 0,
  quiz: [],
  quizAnswered: 0,
  quizScore: 0,
  mapScale: 1,
  planValues: null,
  photoFile: null,
  sheetUrl: "",
  sheetRows: [
    { name: "Aarav Shah", subject: "Mathematics", score: 88, attendance: "94%" },
    { name: "Meera Patel", subject: "Physics", score: 92, attendance: "97%" },
    { name: "Ishaan Gupta", subject: "English", score: 76, attendance: "88%" },
    { name: "Zoya Khan", subject: "Biology", score: 85, attendance: "91%" },
  ],
  chat: [],
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
  }[character]));
}

function cleanText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function titleCase(value = "") {
  return cleanText(value).replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

function shortTopic(value = "") {
  return cleanText(value).split(/[.\n]/)[0].slice(0, 70) || "this topic";
}

function topicWords(value = "") {
  const ignored = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "about", "your", "are", "was", "were", "have", "will", "what", "how", "when", "why", "where", "a", "an", "of", "in", "on", "to", "is"]);
  const words = cleanText(value).match(/[A-Za-z][A-Za-z'-]{2,}/g) || [];
  const unique = [...new Set(words.map((word) => word.toLowerCase()).filter((word) => !ignored.has(word)))];
  return unique.slice(0, 8).map(titleCase);
}

function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2700);
}

function setBusy(button, isBusy, busyText = "Working…") {
  if (!button) return;
  if (isBusy) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.textContent = busyText;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
}

function updateMode() {
  const connected = Boolean(state.apiKey);
  $("#mode-pill").innerHTML = `<i></i> ${connected ? "Gemini connected" : "Demo mode"}`;
  $(".sidebar-card strong").textContent = connected ? "Gemini is connected" : "Demo mode is on";
  $(".sidebar-card small").textContent = connected ? "Your key is active for this session." : "Every tool works with sample AI output.";
  $("#open-settings").textContent = connected ? "Edit connection" : "Connect Gemini";
}

function populateToolCards() {
  $("#tool-grid").innerHTML = TOOL_CARDS.map(([page, symbol, color, title, description]) => `
    <button class="tool-card" data-go="${page}">
      <span class="tool-symbol ${color}">${symbol}</span>
      <h3>${title}</h3><p>${description}</p>
    </button>`).join("");
}

function navigate(page) {
  if (!PAGE_DETAILS[page]) page = "home";
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `${page}-page`));
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $("#page-kicker").textContent = PAGE_DETAILS[page][0];
  $("#page-title").textContent = PAGE_DETAILS[page][1];
  document.body.classList.remove("menu-open");
  $(".sidebar").classList.remove("open");
  history.replaceState(null, "", `#${page}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function parseJson(text, fallback) {
  try {
    const unwrapped = String(text).replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const start = Math.min(...[unwrapped.indexOf("["), unwrapped.indexOf("{")].filter((index) => index >= 0));
    const end = Math.max(unwrapped.lastIndexOf("]"), unwrapped.lastIndexOf("}"));
    return JSON.parse(unwrapped.slice(start, end + 1));
  } catch {
    notify("The AI response was not in the expected format, so a demo version is shown.");
    return fallback;
  }
}

async function askAI(prompt, fallback, { json = false, history = null } = {}) {
  if (!state.apiKey) return fallback;
  const contents = history || [{ role: "user", parts: [{ text: prompt }] }];
  const payload = { contents };
  if (json) payload.generationConfig = { responseMimeType: "application/json" };
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(state.model)}:generateContent`,
      { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": state.apiKey }, body: JSON.stringify(payload) },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || "The Gemini request did not complete.");
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini did not return text.");
    return text;
  } catch (error) {
    console.warn(error);
    notify("Gemini could not respond, so the demo result is shown instead.");
    return fallback;
  }
}

function renderMarkdown(text) {
  const lines = String(text).trim().split(/\r?\n/);
  let html = "";
  let listOpen = false;
  const closeList = () => { if (listOpen) { html += "</ul>"; listOpen = false; } };
  const format = (line) => escapeHtml(line).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, "<code>$1</code>");
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) { closeList(); return; }
    if (/^#{1,2}\s/.test(trimmed)) { closeList(); html += `<h3>${format(trimmed.replace(/^#+\s*/, ""))}</h3>`; }
    else if (/^#{3,}\s/.test(trimmed)) { closeList(); html += `<h4>${format(trimmed.replace(/^#+\s*/, ""))}</h4>`; }
    else if (/^[-*•]\s+/.test(trimmed)) { if (!listOpen) { html += "<ul>"; listOpen = true; } html += `<li>${format(trimmed.replace(/^[-*•]\s+/, ""))}</li>`; }
    else { closeList(); html += `<p>${format(trimmed)}</p>`; }
  });
  closeList();
  return html || `<p>${escapeHtml(text)}</p>`;
}

function makeResume(data) {
  const skills = cleanText(data.skills).split(/[,;•]/).filter(Boolean).map(cleanText);
  return `
    <h2>${escapeHtml(data.name)}</h2>
    <p class="contact-line">${escapeHtml(data.contact)}</p>
    <h4>Profile</h4><p>${escapeHtml(data.objective || `Motivated learner seeking an opportunity to apply ${skills.slice(0, 2).join(" and ") || "strong foundational"} skills while contributing thoughtfully to a team.`)}</p>
    <h4>Education</h4><p>${escapeHtml(data.education)}</p>
    <h4>Skills</h4><p>${escapeHtml(skills.join(" · ") || data.skills)}</p>
    <h4>Experience &amp; projects</h4><p>${escapeHtml(data.experience)}</p>`;
}

function makeNotes(source, style) {
  const title = titleCase(shortTopic(source));
  const words = topicWords(source);
  const concepts = words.length ? words.slice(0, 4) : ["Main idea", "Key process", "Example", "Review point"];
  const depth = style === "detailed" ? "Explain each point using your own class examples." : style === "exam" ? "Use these points to prepare a short answer." : "Keep each point short for a quick review.";
  return `## ${title}\n\n### Core idea\n- ${title} is easiest to understand by first identifying its purpose and main parts.\n- Focus on the relationship between the key ideas, rather than memorizing isolated words.\n\n### Key points\n${concepts.map((concept, index) => `- **${concept}:** Review what it means and why it matters (${index + 1}).`).join("\n")}\n\n### Quick revision\n- ${depth}\n- Ask yourself: “Can I explain ${title.toLowerCase()} in two sentences?”\n- Make one example or diagram before moving on.`;
}

function makeSlides(topic, count) {
  const title = titleCase(shortTopic(topic));
  const concepts = topicWords(topic);
  const points = concepts.length ? concepts : ["main ideas", "key parts", "real-life examples", "review questions"];
  const templates = [
    [title, ["A short introduction to the topic", "Why this topic is worth learning", "What this presentation will cover"]],
    ["The big idea", [`Define ${title.toLowerCase()} in simple words`, "Identify the purpose or problem it addresses", "Connect it to something familiar"]],
    ["Key parts", points.slice(0, 4).map((point) => `${point}: understand its role in the topic`)],
    ["How it works", ["Start with the first important step", "Follow the change, process, or connection", "Notice the result or outcome"]],
    ["Examples and applications", ["Use a simple real-world example", "Compare it with a related idea", "Show where this knowledge is useful"]],
    ["What to remember", [`Summarize ${title.toLowerCase()} in one sentence`, "Review the most important terms", "End with a question for the audience"]],
    ["Quick recap", ["The core concept", "The key connections", "One final takeaway"]],
  ];
  return templates.slice(0, Number(count));
}

function makeMap(source) {
  const title = titleCase(shortTopic(source).split(/[:,–-]/)[0]) || "My syllabus";
  const supplied = cleanText(source).split(/[\n,;]+/).map(cleanText).filter(Boolean);
  const topics = supplied.slice(0, 6).map((item) => item.replace(/^.*?:\s*/, ""));
  const branches = (topics.length ? topics : ["Introduction", "Core ideas", "Important process", "Examples"]).map((topic, index) => {
    const phrase = titleCase(topic);
    return { title: phrase, nodes: [`What is ${phrase.toLowerCase()}?`, `Key idea ${index + 1}`, "Example or application"] };
  });
  return { title, branches };
}

function makeQuiz(topic, count) {
  const label = titleCase(shortTopic(topic));
  const stems = [
    `What is the best first step when learning ${label}?`,
    `Which approach helps explain ${label} most clearly?`,
    `What should you focus on when revising ${label}?`,
    `Which item would make the strongest example of ${label}?`,
    `What is a useful way to check your understanding of ${label}?`,
    `Why is it helpful to connect the parts of ${label}?`,
    `What should a good summary of ${label} include?`,
    `Which revision technique best supports learning ${label}?`,
    `What is the value of a real example in ${label}?`,
    `How can you improve an answer about ${label}?`,
  ];
  const correct = [
    "Identify the central idea and key terms.",
    "Use a clear definition with a relevant example.",
    "The connection between its main ideas.",
    "A situation that shows the concept in action.",
    "Explain it simply without looking at notes.",
    "They show how the topic works as a whole.",
    "A main idea, key points, and a conclusion.",
    "Active recall with short practice questions.",
    "It makes an abstract idea easier to understand.",
    "Use accurate terms and connect them to the question.",
  ];
  return Array.from({ length: Number(count) }, (_, index) => {
    const answer = correct[index % correct.length];
    return {
      question: stems[index % stems.length],
      options: shuffle([answer, "Memorize unrelated details only.", "Skip definitions and examples.", "Use the first idea that comes to mind."]),
      answer,
    };
  });
}

function makeFlashcards(topic, count) {
  const label = titleCase(shortTopic(topic));
  const terms = topicWords(topic);
  const seeds = terms.length ? terms : ["Main idea", "Key term", "Process", "Example", "Connection", "Summary"];
  const cards = seeds.map((term, index) => ({
    question: `How would you explain ${term} in ${label}?`,
    answer: `${term} is a useful part of ${label}. State what it means, how it connects to the main idea, and give one short example.`,
  }));
  while (cards.length < Number(count)) {
    const number = cards.length + 1;
    cards.push({ question: `What is revision point ${number} for ${label}?`, answer: `Review one important relationship in ${label}, then explain it aloud in your own words.` });
  }
  return cards.slice(0, Number(count));
}

function tutorReply(question) {
  const topic = titleCase(shortTopic(question).replace(/^(what|why|how|when|where|can|could|does|do)\s+/i, "")) || "your question";
  return `Here is a simple way to think about **${topic}**:\n\n- Start with the main idea: identify what it is and what job it does.\n- Break it into two or three small parts instead of trying to learn everything at once.\n- Make up one familiar example and explain the connection in your own words.\n\nIf you tell me the subject or the part that feels confusing, I can make this more specific.`;
}

function shuffle(list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[random]] = [copy[random], copy[index]];
  }
  return copy;
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setOutputActions(id, visible = true) {
  const actions = document.querySelector(`[data-actions="${id}"]`);
  if (actions) actions.classList.toggle("hidden", !visible);
}

async function initResume() {
  $("#resume-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const data = getFormData(form);
    setBusy(button, true, "Writing resume…");
    const fallback = makeResume(data);
    const prompt = `Write a concise, polished professional resume using the details below. Return only Markdown with the sections Profile, Education, Skills, and Experience & Projects. Do not invent qualifications.\nName: ${data.name}\nContact: ${data.contact}\nEducation: ${data.education}\nSkills: ${data.skills}\nExperience: ${data.experience}\nObjective: ${data.objective}`;
    const result = await askAI(prompt, "", { json: false });
    $("#resume-output").innerHTML = result ? `<div class="ai-resume">${renderMarkdown(result)}</div>` : fallback;
    if (result) $("#resume-output").classList.remove("markdown-output");
    setOutputActions("resume-output");
    setBusy(button, false);
  });
}

async function initNotes() {
  $("#notes-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const { source, style } = getFormData(form);
    setBusy(button, true, "Organizing notes…");
    const fallback = makeNotes(source, style);
    const prompt = `Convert this source into ${style} study notes. Use short Markdown headings and bullet points. Be accurate; do not add unsupported facts.\n\nSOURCE:\n${source}`;
    const result = await askAI(prompt, fallback);
    $("#notes-output").innerHTML = renderMarkdown(result);
    setOutputActions("notes-output");
    setBusy(button, false);
  });
}

function renderSlide() {
  const slide = state.slides[state.slideIndex];
  if (!slide) return;
  $("#study-slide").innerHTML = `<small>STUDYMATE AI · ${String(state.slideIndex + 1).padStart(2, "0")}</small><h2>${escapeHtml(slide.title || "Untitled slide")}</h2><ul>${(slide.points || []).slice(0, 5).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`;
  $("#slide-number").textContent = `Slide ${state.slideIndex + 1} of ${state.slides.length}`;
  $("#slide-prev").disabled = state.slideIndex === 0;
  $("#slide-next").disabled = state.slideIndex === state.slides.length - 1;
}

function initSlides() {
  $("#slides-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const { topic, count } = getFormData(form);
    const fallback = makeSlides(topic, count);
    setBusy(button, true, "Building slides…");
    const text = await askAI(`Create ${count} concise presentation slides about “${topic}”. Return only a JSON array where each object has a string title and an array of 3–4 short string points.`, JSON.stringify(fallback), { json: true });
    const parsed = parseJson(text, fallback);
    state.slides = Array.isArray(parsed) ? parsed : fallback;
    state.slideIndex = 0;
    $("#slides-stage").classList.remove("hidden");
    $("#slides-empty").classList.add("hidden");
    renderSlide();
    setBusy(button, false);
  });
  $("#slide-prev").addEventListener("click", () => { if (state.slideIndex > 0) { state.slideIndex -= 1; renderSlide(); } });
  $("#slide-next").addEventListener("click", () => { if (state.slideIndex < state.slides.length - 1) { state.slideIndex += 1; renderSlide(); } });
}

function renderMap(map) {
  const branches = Array.isArray(map.branches) ? map.branches : [];
  $("#map-title").textContent = map.title || "Your mind map";
  $("#mindmap-output").innerHTML = `<div class="mindmap-tree" style="transform:scale(${state.mapScale})"><div class="map-root">${escapeHtml(map.title || "My syllabus")}</div><div class="map-branches">${branches.map((branch) => `<section class="map-branch"><h4>${escapeHtml(branch.title || "Topic")}</h4>${(branch.nodes || []).map((node) => `<button class="map-node" data-focus="${escapeHtml(node)}">• ${escapeHtml(node)}</button>`).join("")}</section>`).join("")}</div></div>`;
}

function initMindMap() {
  $("#mindmap-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const { source } = getFormData(form);
    const fallback = makeMap(source);
    setBusy(button, true, "Mapping topics…");
    const text = await askAI(`Turn this syllabus or topic list into a small mind-map outline. Return only JSON: {"title":"...","branches":[{"title":"...","nodes":["...","...","..."]}]}. Use 3–6 branches and short labels.\n\n${source}`, JSON.stringify(fallback), { json: true });
    const parsed = parseJson(text, fallback);
    state.mapScale = 1;
    renderMap(parsed?.branches ? parsed : fallback);
    setBusy(button, false);
  });
  $("#mindmap-output").addEventListener("click", (event) => {
    const node = event.target.closest("[data-focus]");
    if (!node) return;
    const focus = node.dataset.focus;
    $("#focus-title").textContent = focus;
    $("#focus-text").textContent = `For revision, define this idea, write one example, and connect it to the main topic.`;
    $("#focus-note").classList.remove("hidden");
  });
  $("#map-zoom-in").addEventListener("click", () => { state.mapScale = Math.min(1.35, state.mapScale + .1); const tree = $(".mindmap-tree"); if (tree) tree.style.transform = `scale(${state.mapScale})`; });
  $("#map-zoom-out").addEventListener("click", () => { state.mapScale = Math.max(.7, state.mapScale - .1); const tree = $(".mindmap-tree"); if (tree) tree.style.transform = `scale(${state.mapScale})`; });
}

function renderQuiz() {
  $("#quiz-output").innerHTML = state.quiz.map((item, index) => `<article class="panel quiz-question"><h3><span class="question-number">${index + 1}</span>${escapeHtml(item.question || "Question")}</h3><div class="option-list">${(item.options || []).map((option, optionIndex) => `<button class="option-button" data-question="${index}" data-option="${optionIndex}">${escapeHtml(option)}</button>`).join("")}</div></article>`).join("");
  $("#quiz-score").classList.add("hidden");
}

function initQuiz() {
  $("#quiz-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const { topic, count } = getFormData(form);
    const fallback = makeQuiz(topic, count);
    setBusy(button, true, "Making questions…");
    const text = await askAI(`Make ${count} accurate MCQs about “${topic}”. Return only JSON array. Each item must be {"question":"...","options":["...","...","...","..."],"answer":"exact correct option text"}. Use four choices, exactly one answer.`, JSON.stringify(fallback), { json: true });
    const parsed = parseJson(text, fallback);
    state.quiz = Array.isArray(parsed) ? parsed.filter((item) => item.question && Array.isArray(item.options) && item.answer) : fallback;
    if (!state.quiz.length) state.quiz = fallback;
    state.quizAnswered = 0;
    state.quizScore = 0;
    renderQuiz();
    setBusy(button, false);
  });
  $("#quiz-output").addEventListener("click", (event) => {
    const option = event.target.closest(".option-button");
    if (!option || option.disabled) return;
    const questionIndex = Number(option.dataset.question);
    const item = state.quiz[questionIndex];
    const buttons = $$(`[data-question="${questionIndex}"]`, $("#quiz-output"));
    const selected = item.options[Number(option.dataset.option)];
    buttons.forEach((button) => {
      button.disabled = true;
      if (button.textContent === item.answer) button.classList.add("correct");
    });
    if (selected === item.answer) state.quizScore += 1;
    else option.classList.add("incorrect");
    state.quizAnswered += 1;
    if (state.quizAnswered === state.quiz.length) {
      const score = Math.round((state.quizScore / state.quiz.length) * 100);
      $("#quiz-score").innerHTML = `<h3>You scored ${state.quizScore} / ${state.quiz.length} (${score}%).</h3><p>${score >= 80 ? "Great recall — try a new topic when you are ready." : "Nice effort. Review the highlighted answers, then take another quick quiz."}</p>`;
      $("#quiz-score").classList.remove("hidden");
    }
  });
}

function appendMessage(role, content) {
  const messages = $("#chat-messages");
  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.innerHTML = role === "bot" ? `<span class="message-avatar">✦</span><div>${renderMarkdown(content)}</div>` : `<p>${escapeHtml(content)}</p>`;
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

function initTutor() {
  $("#chat-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("input[name=message]", event.currentTarget);
    const question = cleanText(input.value);
    if (!question) return;
    const button = $("button[type=submit]", event.currentTarget);
    appendMessage("user", question);
    input.value = "";
    state.chat.push({ role: "user", parts: [{ text: question }] });
    setBusy(button, true, "Thinking…");
    const system = "You are a friendly tutor. Explain simply, accurately, and briefly. Use a small example when useful. Format in short Markdown. ";
    const history = [{ role: "user", parts: [{ text: system }] }, { role: "model", parts: [{ text: "I will help with simple, clear explanations." }] }, ...state.chat];
    const reply = await askAI(question, tutorReply(question), { history });
    state.chat.push({ role: "model", parts: [{ text: reply }] });
    appendMessage("bot", reply);
    setBusy(button, false);
  });
  $("#clear-chat").addEventListener("click", () => {
    state.chat = [];
    $("#chat-messages").innerHTML = `<div class="chat-message bot"><span class="message-avatar">✦</span><p>Hi! What would you like help understanding today?</p></div>`;
  });
}

function renderFlashcard() {
  const card = state.flashcards[state.cardIndex];
  if (!card) return;
  $("#flashcard").classList.remove("flipped");
  $("#flashcard-question").textContent = card.question || "Question";
  $("#flashcard-answer").textContent = card.answer || "Answer";
  $("#card-counter").textContent = `Card ${state.cardIndex + 1} of ${state.flashcards.length}`;
}

function initFlashcards() {
  $("#flashcards-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const { topic, count } = getFormData(form);
    const fallback = makeFlashcards(topic, count);
    setBusy(button, true, "Writing cards…");
    const text = await askAI(`Create ${count} concise revision flashcards on “${topic}”. Return only a JSON array where every item has a question and answer string. Keep answers under 35 words.`, JSON.stringify(fallback), { json: true });
    const parsed = parseJson(text, fallback);
    state.flashcards = Array.isArray(parsed) ? parsed.filter((item) => item.question && item.answer) : fallback;
    if (!state.flashcards.length) state.flashcards = fallback;
    state.cardIndex = 0;
    $("#flashcard-area").classList.remove("hidden");
    $("#flashcards-empty").classList.add("hidden");
    renderFlashcard();
    setBusy(button, false);
  });
  $("#flashcard").addEventListener("click", () => $("#flashcard").classList.toggle("flipped"));
  $("#card-next").addEventListener("click", () => { state.cardIndex = (state.cardIndex + 1) % state.flashcards.length; renderFlashcard(); });
  $("#card-shuffle").addEventListener("click", () => { state.flashcards = shuffle(state.flashcards); state.cardIndex = 0; renderFlashcard(); notify("Deck shuffled."); });
}

const PLAN_COLOURS = [
  ["#e6ecff", "#5668c7"], ["#e7f7ed", "#4c9a69"], ["#fff1df", "#ba7a35"], ["#f5eafa", "#9c66b4"], ["#ffe9eb", "#bd6472"],
];

function makePlan({ subjects, hours }) {
  const topics = subjects.split(",").map(cleanText).filter(Boolean);
  const usableTopics = topics.length ? topics : ["Revision"];
  const daily = Math.max(1, Math.min(12, Number(hours) || 2));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day, dayIndex) => {
    const numberOfSessions = daily >= 4 ? 3 : daily >= 2 ? 2 : 1;
    const minutes = Math.round((daily * 60) / numberOfSessions / 5) * 5;
    return { day, sessions: Array.from({ length: numberOfSessions }, (_, sessionIndex) => ({ subject: usableTopics[(dayIndex + sessionIndex) % usableTopics.length], time: `${minutes} min · ${sessionIndex === numberOfSessions - 1 ? "Review" : "Focus"}` })) };
  });
}

function renderPlan(plan) {
  const topics = [...new Set(plan.flatMap((day) => day.sessions.map((session) => session.subject)))];
  const colourFor = (subject) => PLAN_COLOURS[topics.indexOf(subject) % PLAN_COLOURS.length];
  $("#schedule-grid").innerHTML = plan.map((day) => `<section class="day-column"><h4>${day.day}</h4>${day.sessions.map((session) => { const [bg, text] = colourFor(session.subject); return `<div class="study-session" style="background:${bg};color:${text}"><span>${session.time}</span><strong>${escapeHtml(session.subject)}</strong></div>`; }).join("")}</section>`).join("");
  $("#schedule-key").innerHTML = topics.map((subject) => { const [bg, text] = colourFor(subject); return `<span><i style="background:${text}"></i>${escapeHtml(subject)}</span>`; }).join("");
}

function initPlanner() {
  $("#planner-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.planValues = getFormData(event.currentTarget);
    renderPlan(makePlan(state.planValues));
    $("#schedule-wrap").classList.remove("hidden");
    $("#planner-empty").classList.add("hidden");
  });
  $("#regenerate-plan").addEventListener("click", () => {
    if (!state.planValues) return;
    const values = { ...state.planValues, subjects: shuffle(state.planValues.subjects.split(",")).join(",") };
    renderPlan(makePlan(values));
    notify("Your plan has a fresh subject order.");
  });
}

function initPhotoNotes() {
  $("#note-image").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) return;
    state.photoFile = file;
    $("#note-image-preview").src = URL.createObjectURL(file);
    $("#image-preview").classList.remove("hidden");
    $("#ocr-status").textContent = "Photo ready. Press “Extract text from photo” when you are ready.";
  });
  $("#extract-text").addEventListener("click", async (event) => {
    if (!state.photoFile) { notify("Choose an image first, or paste text into the box."); return; }
    if (!window.Tesseract) { $("#ocr-status").textContent = "OCR could not load. Please type or paste the note text instead."; return; }
    const button = event.currentTarget;
    setBusy(button, true, "Reading photo…");
    try {
      const result = await window.Tesseract.recognize(state.photoFile, "eng", { logger: (message) => {
        if (message.status === "recognizing text") $("#ocr-status").textContent = `Reading photo… ${Math.round(message.progress * 100)}%`;
      } });
      $("#extracted-text").value = result.data.text.trim();
      $("#ocr-status").textContent = "Text extracted. Please check it for any spelling mistakes.";
    } catch (error) {
      console.warn(error);
      $("#ocr-status").textContent = "OCR could not read this image. You can still type or paste your text below.";
    }
    setBusy(button, false);
  });
  $("#summarize-photo").addEventListener("click", async (event) => {
    const source = cleanText($("#extracted-text").value);
    if (!source) { notify("Add or extract some note text first."); return; }
    const button = event.currentTarget;
    setBusy(button, true, "Summarizing…");
    const fallback = makeNotes(source, "short");
    const text = await askAI(`Summarize these study notes into short, accurate Markdown headings and bullet points.\n\n${source}`, fallback);
    $("#photo-output").innerHTML = renderMarkdown(text);
    setBusy(button, false);
  });
}

function normalizeRows(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.data || payload?.rows || payload?.values || [];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => Array.isArray(row)
    ? { name: row[0], subject: row[1], score: row[2], attendance: row[3] }
    : { name: row.name || row.student || row.Student || "Student", subject: row.subject || row.Subject || "—", score: row.score ?? row.marks ?? row.Score ?? "—", attendance: row.attendance || row.Attendance || "—" });
}

function renderSheetRows() {
  $("#sheet-table-body").innerHTML = state.sheetRows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.subject)}</td><td>${escapeHtml(row.score)}</td><td>${escapeHtml(row.attendance)}</td></tr>`).join("");
}

function initSheets() {
  renderSheetRows();
  $("#sheet-url-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = cleanText($("#sheet-url").value);
    if (!url) { notify("Paste your deployed Apps Script web-app URL first."); return; }
    const button = $("button", event.currentTarget);
    setBusy(button, true, "Loading…");
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not load sheet data.");
      const rows = normalizeRows(await response.json());
      if (!rows.length) throw new Error("No compatible rows were found.");
      state.sheetRows = rows;
      state.sheetUrl = url;
      $("#sheet-source-label").textContent = "Connected to your Apps Script";
      renderSheetRows();
      notify("Live sheet data loaded.");
    } catch (error) {
      console.warn(error);
      notify("Could not load that endpoint. Check its JSON output and sharing settings.");
    }
    setBusy(button, false);
  });
  $("#sheet-add-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const row = getFormData(event.currentTarget);
    state.sheetRows.push(row);
    renderSheetRows();
    event.currentTarget.reset();
    notify(state.sheetUrl ? "Record added here. Sending it to your endpoint…" : "Record added to the sample table.");
    if (state.sheetUrl) {
      try { await fetch(state.sheetUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) }); }
      catch (error) { console.warn(error); notify("The local table updated, but the endpoint did not accept the POST."); }
    }
  });
  $("#sheet-insight").addEventListener("click", () => {
    const scores = state.sheetRows.map((row) => Number(row.score)).filter(Number.isFinite);
    if (!scores.length) { notify("Add numeric scores before asking for an insight."); return; }
    const average = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    const best = state.sheetRows.reduce((winner, row) => Number(row.score) > Number(winner.score) ? row : winner, state.sheetRows[0]);
    $("#sheet-insight-output").innerHTML = `<strong>✦ Quick class insight</strong><p>Average score: <b>${average}%</b>. The highest score is ${escapeHtml(best.score)}% by ${escapeHtml(best.name)}. Use this as a starting point for a class discussion, not a final judgement.</p>`;
    $("#sheet-insight-output").classList.remove("hidden");
  });
}

function initUtilities() {
  document.addEventListener("click", (event) => {
    const go = event.target.closest("[data-go]");
    if (go) navigate(go.dataset.go);
    const copy = event.target.closest("[data-copy]");
    if (copy) copyElement(copy.dataset.copy);
    const download = event.target.closest("[data-download]");
    if (download) downloadElement(download.dataset.download, download.dataset.filename || "studymate.txt");
    const print = event.target.closest("[data-print]");
    if (print) window.print();
  });
  $$(".nav-link").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
  $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
  $("#open-settings").addEventListener("click", openSettings);
  $("#settings-button").addEventListener("click", openSettings);
  $("#save-settings").addEventListener("click", () => {
    state.apiKey = cleanText($("#gemini-key").value);
    state.model = cleanText($("#gemini-model").value) || "gemini-3.6-flash";
    if (state.apiKey) sessionStorage.setItem("studymate-api-key", state.apiKey); else sessionStorage.removeItem("studymate-api-key");
    sessionStorage.setItem("studymate-model", state.model);
    updateMode();
    notify(state.apiKey ? "Gemini connection saved for this session." : "Demo mode is active.");
  });
}

function openSettings() {
  $("#gemini-key").value = state.apiKey;
  $("#gemini-model").value = state.model;
  $("#settings-dialog").showModal();
}

async function copyElement(id) {
  const content = cleanText(document.getElementById(id)?.innerText);
  if (!content) return;
  try { await navigator.clipboard.writeText(content); notify("Copied to your clipboard."); }
  catch { notify("Copy was not available in this browser."); }
}

function downloadElement(id, filename) {
  const content = document.getElementById(id)?.innerText || "";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  notify("Download started.");
}

function start() {
  populateToolCards();
  updateMode();
  initUtilities();
  initResume();
  initNotes();
  initSlides();
  initMindMap();
  initQuiz();
  initTutor();
  initFlashcards();
  initPlanner();
  initPhotoNotes();
  initSheets();
  navigate(location.hash.replace("#", "") || "home");
}

start();
