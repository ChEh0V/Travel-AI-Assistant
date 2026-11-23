import io
import json
import sqlite3
import unittest
from datetime import datetime,timezone
from unittest.mock import patch
from urllib.error import URLError
from server import Index,generate,replace_catalog,snapshot, CatalogCache
from pathlib import Path
from tempfile import TemporaryDirectory

class SystemTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs=snapshot()
        cls.index=Index(cls.docs)

    def ask(self,*questions,year=2026):
        return self.index.ask([{"role":"user","content":q} for q in questions],
                              now=datetime(year,11,23,tzinfo=timezone.utc))
    def test_snapshot_sources(self):
        self.assertEqual(len(self.docs),30)
        for d in self.docs:
            self.assertTrue(d["checked"] and d["license"] and d["source_id"] and d["url"].startswith("https://"))
    def test_ambiguous_followup(self):
        self.assertIn("Какой",self.ask("Адрес Орсе и Лувра","Какие там события?")["reply"])
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
        replace_catalog(db,self.docs)
        db.execute("CREATE TRIGGER interruption BEFORE INSERT ON documents WHEN NEW.id='D10' BEGIN SELECT RAISE(ABORT,'failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            replace_catalog(db,self.docs)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM documents").fetchone()[0],30)
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
                replace_catalog(db,changed)
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

