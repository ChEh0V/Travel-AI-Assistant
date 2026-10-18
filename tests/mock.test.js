const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMock() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/mock.js"), "utf8"), ctx);
  return ctx;
}

test("отвечает про достопримечательности города", () => {
  const { mockReply } = loadMock();
  assert.match(mockReply("Что посмотреть в Риме?"), /Колизей/);
});

test("помнит город из прошлого вопроса", () => {
  const { mockReply } = loadMock();
  mockReply("Что посмотреть в Риме?");
  assert.match(mockReply("А что бесплатно?"), /Пантеон/);
});

test("строит маршрут по дням", () => {
  const { mockReply } = loadMock();
  assert.match(mockReply("Маршрут по Токио на 2 дня"), /День 1/);
});

test("неизвестный город — подсказка вместо выдумки", () => {
  const { mockReply } = loadMock();
  assert.match(mockReply("Что посмотреть в Берлине?"), /лучше всего знаю/);
});
