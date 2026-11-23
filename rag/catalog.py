"""Sources and normalized records for the Paris pilot (Python 3.10+)."""
import csv
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MUSEUMS = "https://ministere-culture.s3.sbg.io.cloud.ovh.net/POP/museofile.csv"
EVENTS = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records"
WIKI = "https://query.wikidata.org/sparql"
AGENT = "PoputchikCourse/1.0 (https://github.com/ChEh0V/Travel-AI-Assistant)"
# Local search forms also handle common inflections and transliterations.
PLACES = [
    ("M5060","Орсе","Musée d'Orsay"), ("M1103","Бурделя","Musée Bourdelle"),
    ("M1115","Цадкина","Musée Zadkine"), ("M1107","Коньяк-Жэ","Musée Cognacq-Jay"),
    ("M5031","Лувр","Musée du Louvre"), ("M5044","Родена","Musée Rodin"),
    ("M5041","Гюстава Моро","Musée Gustave Moreau"), ("M5005","Гиме","Musée Guimet"),
    ("M5030","Оранжери","Musée de l'Orangerie"), ("M5055","Бранли","Musée du quai Branly"),
    ("M1104","Карнавале","Musée Carnavalet"), ("M1102","Бальзака","Maison de Balzac"),
    ("M1114","Виктора Гюго","Maison de Victor Hugo"), ("M5043","Пикассо","Musée Picasso"),
    ("M1111","Малый дворец","Petit Palais"),
]
SEED_EVENTS = "127370 117930 117935 35898 125419 125424 116951 127557 127555 118014 126277 124631 127367 127410 117962".split()
THEMES = {"Arts décoratifs":"декоративное искусство","Beaux-Arts":"изобразительное искусство",
          "Histoire":"история","Archéologie":"археология","Littérature":"литература",
          "Beaux-arts":"изобразительное искусство","Art moderne et contemporain":"современное искусство",
          "Arts de l'Islam":"исламское искусство","Afrique":"Африка","Amérique":"Америка","Asie":"Азия","Océanie":"Океания",
          "Ethnologie":"этнология","Photographie":"фотография"}
FIELDS = "id,title,address_name,address_street,date_start,date_end,url,price_type,updated_at,occurrences,qfap_tags"

EVENT_TITLES = json.loads(Path(__file__).with_name("event_titles.json").read_text(encoding="utf-8"))

def download(url):
    with urlopen(Request(url, headers={"User-Agent": AGENT}), timeout=45) as response:
        return response.read().decode("utf-8-sig")

def names():
    ids = " ".join(f'"{p[0]}"' for p in PLACES)
    query = ('SELECT ?id ?item ?ru WHERE { VALUES ?id { '+ids+
             ' } ?item wdt:P539 ?id . OPTIONAL { ?item rdfs:label ?ru FILTER(lang(?ru)="ru") } }')
    return json.loads(download(WIKI+"?"+urlencode({"query":query,"format":"json"})))["results"]["bindings"]

def museum_docs(raw, labels, checked):
    rows = {r["Identifiant"]:r for r in csv.DictReader(io.StringIO(raw), delimiter="|")}
    records = []
    for i,(key,alias,venue) in enumerate(PLACES,1):
        row = rows[key]
        wd = next((v for v in labels if v["id"]["value"]==key and v.get("ru")), {})
        title = wd.get("ru",{}).get("value",alias)
        themes = [THEMES.get(t.strip(),t.strip()) for t in row["Domaine_thematique"].split(";") if t.strip()]
        records.append(dict(id=f"D{i:02}", source_id=key, place=key, kind="museum", name=title,
            official=row["Nom_officiel"], venue=venue, alias=alias, address=row["Adresse"],
            themes=", ".join(themes), coordinates=row["Coordonnees"], website=row["URL"],
            wikidata=wd.get("item",{}).get("value","").replace("http:","https:"),
            url="https://pop.culture.gouv.fr/notice/museo/"+key, updated=row["Date_de_mise_a_jour"],
            checked=checked, license="Licence Ouverte 2.0; Wikidata CC0"))
    return records

def translation(row):
    original,ru=EVENT_TITLES.get(str(row["id"]),("",""))
    return ru if original==row["title"] else ""

def session_days(occurrences):
    """Calendar dates explicitly listed by the publisher, before UTC conversion."""
    days=set()
    for occurrence in (occurrences or "").split(";"):
        if occurrence.strip():
            start=occurrence.split("_",1)[0]
            days.add(datetime.fromisoformat(start).date().isoformat())
    return sorted(days)

def event_doc(row, checked):
    place = next((p for p in PLACES if p[2].casefold()==row["address_name"].casefold()),None)
    if not place or not row["date_end"] or not row["date_start"] or not row["url"].startswith("https://www.paris.fr/"):
        raise ValueError("Invalid Paris event: "+str(row["id"]))
    key = str(row["id"])
    doc_id = f"D{16+SEED_EVENTS.index(key):02}" if key in SEED_EVENTS else "E"+key
    return dict(id=doc_id, source_id=key, place=place[0], kind="event", name=row["title"],
                tags=(row["qfap_tags"] or "").split(";"), days=session_days(row["occurrences"]), title_ru=translation(row), venue=place[2], alias=place[1], address=row["address_street"], start=row["date_start"],
                end=row["date_end"], price={"gratuit":"бесплатный","payant":"платный"}.get(row["price_type"],"не указан"),
                updated=row["updated_at"], url=row["url"], checked=checked, license="ODbL 1.0")

def fetch_catalog():
    checked = datetime.now(timezone.utc).isoformat()
    museums = museum_docs(download(MUSEUMS),names(),checked)
    venues = ",".join(json.dumps(p[2],ensure_ascii=False) for p in PLACES)
    where = "address_city='Paris' AND date_end >= now() AND address_name IN ("+venues+")"
    events = []
    offset = 0
    while True:
        params = dict(where=where,select=FIELDS,limit=100,offset=offset,order_by="id")
        page = json.loads(download(EVENTS+"?"+urlencode(params)))
        events.extend(event_doc(r,checked) for r in page["results"])
        offset += len(page["results"])
        if offset >= page["total_count"]:
            break
        if not page["results"]:
            raise ValueError("Incomplete event feed")
    return museums+events
