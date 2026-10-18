const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const send = document.getElementById("send");
const chips = document.getElementById("chips");

const SUGGESTIONS = [
  "Что посмотреть в Риме за 2 дня?",
  "Маршрут по Токио",
  "Куда поехать на выходные?",
  "Как сэкономить в поездке?",
];

const messages = [];

function addMessage(role, text) {
  const el = document.createElement("div");
  el.className = "msg " + (role === "user" ? "user" : "bot");
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

async function ask(text) {
  text = text.trim();
  if (!text || send.disabled) return;
  messages.push({ role: "user", content: text });
  addMessage("user", text);
  input.value = "";
  send.disabled = true;
  chips.hidden = true;

  const typing = addMessage("bot", "Ассистент печатает…");
  typing.classList.add("typing");
  try {
    const reply = await getReply(messages);
    messages.push({ role: "assistant", content: reply });
    typing.classList.remove("typing");
    typing.textContent = reply;
  } catch (e) {
    typing.textContent = "Не удалось получить ответ. Попробуйте ещё раз.";
  } finally {
    send.disabled = false;
    input.focus();
    chat.scrollTop = chat.scrollHeight;
  }
}

form.addEventListener("submit", e => { e.preventDefault(); ask(input.value); });

SUGGESTIONS.forEach(s => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.textContent = s;
  b.onclick = () => ask(s);
  chips.appendChild(b);
});

addMessage("bot", "Привет! Я помогу спланировать поездку: подскажу достопримечательности, составлю маршрут и поделюсь лайфхаками. Куда собираетесь?");
