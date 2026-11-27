import io
import json
import sqlite3
import unittest
from datetime import datetime,timezone
from unittest.mock import patch
from urllib.error import URLError
from server import airport_reply,connection_reply,interpret_turn,Index,generate,plan_advice,replace_base_catalog,snapshot, CatalogCache
from venues import LODGING
from pathlib import Path
from tempfile import TemporaryDirectory

class SystemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs=snapshot(include_venues=False,include_context=False)
        cls.index=Index(cls.docs)

    def ask(self,*questions,year=2026):
        return self.index.ask([{"role":"user","content":q} for q in questions],
                              now=datetime(year,11,23,tzinfo=timezone.utc))
    def test_snapshot_sources(self):
        self.assertEqual(len(self.docs),102)
        for d in self.docs:
            self.assertTrue(d["checked"] and d["license"] and d["source_id"] and d["url"].startswith("https://"))

    def test_qwen_advice_validates_choices(self):
        messages=[{"role":"user","content":"Хочу что-то весёлое"}]
        context="Город: Париж\nМеста из каталога: Лувр, Монмартр"
        with patch.dict("os.environ",RAG_MODEL="test"), patch("server.request_completion") as completion:
            completion.return_value='{"place":2,"activity":1}'
            response=plan_advice(messages,context)
            self.assertEqual(response["mode"],"llm")
            self.assertIn("«Монмартр»",response["reply"])
            completion.return_value='{"place":3,"activity":1}'
            self.assertEqual(plan_advice(messages,context)["mode"],"extractive-fallback")
            completion.return_value='null'
            self.assertEqual(plan_advice(messages,context)["mode"],"extractive")

    def test_event_requests_use_official_references(self):
        for name in ("Барсы", "Барселоны"):
            reply=Index(snapshot()).ask([{"role":"user","content":"Хочу посмотреть матч "+name}])
            self.assertEqual(reply["mode"],"official")
            self.assertIn("fcbarcelona.com",reply["sources"][0]["url"])
        theatre=self.index.ask([{"role":"user","content":"Театр"}],city="barcelona")
        self.assertIn("tnc.cat",theatre["sources"][0]["url"])
        unknown=self.ask("Театр")
        self.assertIn("В каком городе",unknown["reply"])
        reply=self.index.ask([{"role":"user","content":"Театр"},
                              {"role":"assistant","content":unknown["reply"]},
                              {"role":"user","content":"В Вене"}])
        self.assertIn("wiener-staatsoper.at",reply["sources"][0]["url"])
    def test_ambiguous_followup(self):
        self.assertIn("Какой",self.ask("Адрес Орсе и Лувра","Какие там события?")["reply"])
    def test_european_guides(self):
        guides={d["code"]:d for d in self.docs if d["kind"]=="guide"}
        from europe import destinations
        self.assertEqual(set(guides),{code for code,_ in destinations()})
        for code,doc in guides.items():
            with self.subTest(code=code):
                reply=self.ask("Расскажи про "+doc["name"])
                self.assertEqual(reply["hits"],[doc["id"]])
                self.assertIn("oldid=",reply["sources"][0]["url"])
        self.assertIn("Берлинская стена",self.ask("Что посмотреть в Берлине?")["reply"])
        self.assertEqual(self.ask("Расскажи про Италию","Какая там кухня?")["hits"],[guides["IT"]["id"]])
        self.assertFalse(self.ask("Какие выставки в Германии?")["sources"])

    def test_guide_scope_and_landmarks(self):
        self.assertFalse(self.ask("Расскажи про Швецию","Какие там события?")["hits"])
        self.assertIn("Берлинская стена",self.ask("Маршрут по Берлину")["reply"])
        self.assertIn("ru.wikipedia.org",self.ask("Что посмотреть в Вене?")["sources"][0]["url"])

    def test_migrate_old_catalog(self):
        import server
        with TemporaryDirectory() as tmp, patch("server.DB",Path(tmp)/"existing.sqlite3"):
            db=server.connect()
            db.execute("DELETE FROM documents WHERE id LIKE 'G%'")
            db.execute("DELETE FROM documents WHERE id LIKE 'V%'")
            db.execute("DELETE FROM documents WHERE id LIKE 'C%'")
            db.execute("DROP TABLE catalog_metadata")
            db.execute("INSERT INTO documents VALUES ('E999','{}')")
            db.commit();db.close()
            for _ in range(2):
                db=server.connect()
                self.assertEqual(db.execute("SELECT COUNT(*) FROM documents").fetchone()[0],len(snapshot())+1)
                replace_base_catalog(db,self.docs)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM documents").fetchone()[0],len(snapshot()))
                # Keep a sentinel refreshed event for the next connection.
                db.execute("INSERT INTO documents VALUES ('E999','{}')")
                db.commit()
                db.close()

    def test_venue_coverage_and_city_context(self):
        index=Index(snapshot())
        def ask(*questions):
            return index.ask([dict(role="user",content=q) for q in questions])
        for city, guide in index.city_guides.items():
            for word, categories in [("кафе",{"cafe"}),("рестораны",{"restaurant"}),("жильё",LODGING)]:
                with self.subTest(city=city, category=word):
                    reply=ask("Расскажи про "+guide["name"],"А где там найти "+word+"?")
                    self.assertGreaterEqual(len(reply["hits"]),3)
                    for key, source in zip(reply["hits"], reply["sources"]):
                        self.assertEqual(index.venues[key]["code"],city)
                        self.assertIn(index.venues[key]["category"],categories)
                        self.assertEqual(source["url"],index.venues[key]["url"])
                        self.assertTrue(source["credit"])
        self.assertFalse(ask("Кафе в Париже","А отели в Неаполе?")["sources"])
        self.assertFalse(ask("Есть ли свободные номера в отелях Вены завтра?")["sources"])
        mixed=ask("Кафе, рестораны и жильё в Вене")
        self.assertTrue({"cafe","restaurant"} < {index.venues[key]["category"] for key in mixed["hits"]})
        with patch.dict("os.environ",RAG_MODEL="test"), patch("server.request_completion") as completion:
            self.assertEqual(generate(mixed,"Кафе, рестораны и жильё в Вене")["mode"],"directory")
            completion.assert_not_called()
        clarification=index.ask([{"role":"user","content":"Где поесть?"},
                                 {"role":"assistant","content":"Уточните город, где искать кафе, рестораны или жильё."},
                                 {"role":"user","content":"Вена"}])
        self.assertTrue(clarification["hits"])
        unknown=index.ask([{"role":"user","content":"Кафе в Вене"},
                           {"role":"user","content":"Кафе в Неаполе"},
                           {"role":"assistant","content":"Уточните город, где искать кафе, рестораны или жильё."},
                           {"role":"user","content":"А где там остановиться?"}],city="vienna")
        self.assertFalse(unknown["hits"])

    def test_football_followup_and_change_to_catalan_food(self):
        index=Index(snapshot())
        history=[]
        for question,expected in [
            ("хочу посмотреть футбол в барселоне","календарь"),
            ("как называется стадион","Spotify Camp Nou"),
            ("футбольный стадион как называется в барселоне","Spotify Camp Nou"),
            ("где поесть традиционную каталонскую еду","7 Portes"),
        ]:
            history.append(dict(role="user",content=question))
            reply=index.ask(history,city="vienna")
            self.assertIn(expected,reply["reply"])
            history.append(dict(role="assistant",content=reply["reply"]))
        self.assertIn("Can Culleretes",reply["reply"])
        self.assertEqual(set(reply["hits"]),{"V01","V02"})
        self.assertTrue(all("fcbarcelona" not in source["url"] for source in reply["sources"]))

    def test_city_discovery_records(self):
        index=Index(snapshot())
        for question, names in (
            ("Где играет Арсенал?", ("Emirates Stadium",)),
            ("Футбол в Мадриде", ("Сантьяго Бернабеу","Riyadh Air Metropolitano")),
            ("Стадион в Мюнхене", ("Allianz Arena",)),
            ("Где послушать фаду в Лиссабоне?", ("Museu do Fado",)),
            ("Места съёмок фильма в Вене", ("Третьего человека",)),
            ("Что необычного в Праге?", ("Орлой","Клементинум")),
            ("Подземелья Берлина", ("Berliner Unterwelten",)),
        ):
            answer=index.ask([dict(role="user",content=question)])
            for name in names:
                self.assertIn(name,answer["reply"],question)
            self.assertTrue(answer["sources"])
        answer=index.ask([dict(role="user",content="Футбол в Тбилиси")],city="barcelona")
        self.assertEqual(answer["sources"],[])

    def test_transport_questions_take_priority_over_planner(self):
        messages=[dict(role="user",content="как мне долететь до вены из австрии")]
        with patch("server.request_completion") as completion:
            turn=interpret_turn(messages,"prague")
            completion.assert_not_called()
        self.assertEqual(turn["intent"],"transport")
        answer=connection_reply(turn["query"])
        self.assertIn("Из какого города",answer["reply"])
        self.assertIn("oebb.at",answer["sources"][0]["url"])
        messages.extend([dict(role="assistant",content=answer["reply"]),dict(role="user",content="Из Граца")])
        turn=interpret_turn(messages,"prague")
        self.assertEqual(turn["intent"],"transport")
        self.assertEqual(connection_reply(turn["query"])["status"],"answered")

    def test_airport_codes_transfers_and_departure_sources(self):
        index = Index(snapshot())
        for question, expected in (
            ("Какие аэропорты в Париже?", ("CDG","ORY","RER B","линии 14")),
            ("Как доехать из CDG до Парижа?", ("CDG","RER B")),
            ("Лечу из Барселоны в Вену, какие рейсы?", ("VIE","Railjet")),
        ):
            turn = interpret_turn([dict(role="user",content=question)],"",index)
            self.assertEqual(turn["intent"],"transport")
            answer = airport_reply(index,turn["query"])
            for value in expected:
                self.assertIn(value,answer["reply"])
        self.assertNotIn("ORY", airport_reply(index,"Как доехать из CDG до Парижа?")["reply"])
        self.assertTrue(any(source["credit"]=="Вылеты BCN" for source in answer["sources"]))
        self.assertIsNone(airport_reply(index,"Аэропорт Тбилиси",city="vienna"))

    def test_flight_boards_with_city_or_airport_code(self):
        index = Index(snapshot())
        for question, airport, domain in (
            ("Табло вылетов Стокгольма", "ARN", "swedavia.com"),
            ("Табло HEL", "HEL", "finavia.fi"),
            ("Вылеты из Будапешта", "BUD", "bud.hu"),
            ("Табло BER", "BER", "ber.berlin-airport.de"),
        ):
            turn = interpret_turn([dict(role="user",content=question)],"",index)
            self.assertEqual(turn["intent"],"transport")
            answer = airport_reply(index,turn["query"])
            self.assertIn(airport,answer["reply"])
            self.assertTrue(any(s["credit"]=="Табло "+airport and domain in s["url"] for s in answer["sources"]))
        self.assertIn("код",airport_reply(index,"Табло вылетов")["reply"])

    def test_city_switch(self):
        self.assertEqual(self.ask("Адрес Орсе","А какие события в Риме?")["sources"],[])
    def test_expired(self):
        self.assertEqual(self.ask("Какие события в Орсе?",year=2030)["hits"],[])
    def test_free_event(self):
        self.assertEqual(self.ask("Бесплатные события в Коньяк-Жэ")["hits"],["D26"])
    def test_listed_day(self):
        self.assertEqual(self.ask("Какие события у Цадкина в субботу?")["hits"],["D24"])
        self.assertFalse(self.ask("Какие события у Цадкина завтра?")["sources"])

    def test_admission(self):
        self.assertFalse(self.ask("Вход в музей Коньяк-Жэ бесплатный?")["sources"])
    def test_atomic_replacement(self):
        db=sqlite3.connect(":memory:")
        db.execute("CREATE TABLE documents(id TEXT PRIMARY KEY,body TEXT NOT NULL)")
        replace_base_catalog(db,self.docs)
        db.execute("CREATE TRIGGER interruption BEFORE INSERT ON documents WHEN NEW.id='D10' BEGIN SELECT RAISE(ABORT,'failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            replace_base_catalog(db,self.docs)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM documents").fetchone()[0],len(self.docs))
        db.close()
    def test_cache_follows_committed_edits(self):
        with TemporaryDirectory() as tmp, patch("server.DB",Path(tmp)/"catalog.sqlite3"):
            import server
            db=server.connect()
            cache=CatalogCache()
            try:
                before=cache.current()
                self.assertIs(cache.current(),before)
                changed=[dict(d,address="тестовый адрес") if d["id"]=="D01" else d for d in self.docs]
                replace_base_catalog(db,changed)
                self.assertIn("тестовый адрес",cache.current().ask([{"role":"user","content":"Адрес Орсе?"}])["reply"])
            finally:
                cache.reader.close()
                db.close()

    def test_clarification_restores_intent(self):
        result=self.index.ask([{"role":"user","content":"Какой адрес музея?"},
                               {"role":"assistant","content":"Уточните название музея в Париже."},
                               {"role":"user","content":"Орсе"}])
        self.assertEqual(result["hits"],["D01"])

    def test_unknown_quoted_event(self):
        self.assertFalse(self.ask("Есть выставка «несуществующая выставка» в Орсе?")["sources"])

    def test_exhibition_filters_require_publisher_tag(self):
        self.assertEqual(len(self.ask("Детские выставки в музее Бурделя")["hits"]),2)
        self.assertFalse(self.ask("Бесплатные выставки Коньяк-Жэ")["sources"])

    def test_unknown_topic(self):
        self.assertFalse(self.ask("Есть в Орсе выставки про динозавров?")["sources"])

    def test_provider_offline(self):
        result=self.ask("Адрес Орсе?")
        with patch.dict("os.environ",RAG_MODEL="test"),patch("server.urlopen",side_effect=URLError("offline")):
            answer=generate(result,"Адрес Орсе?")
        self.assertEqual(answer["mode"],"extractive-fallback")
        self.assertEqual(answer["reply"],result["reply"])

    def test_citation_without_requested_fact(self):
        result=self.ask("Адрес Орсе?")
        body={"choices":[{"message":{"content":"Музей Орсе [D01]"}}]}
        with patch.dict("os.environ",RAG_MODEL="test"),patch("server.urlopen",return_value=io.BytesIO(json.dumps(body).encode())):
            self.assertEqual(generate(result,"Адрес?")["mode"],"extractive-fallback")

    def test_generator_contract(self):
        result=self.ask("Адрес музея Орсе?")
        for citation,expected in [("D01","llm"),("D99","extractive-fallback")]:
            message={"choices":[{"message":{"content":"1 rue de Bellechasse ["+citation+"]"}}]}
            with patch.dict("os.environ",RAG_MODEL="test"),patch("server.urlopen",return_value=io.BytesIO(json.dumps(message).encode())):
                self.assertEqual(generate(result,"Адрес?")["mode"],expected)

