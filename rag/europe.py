"""Versioned Russian Wikivoyage guide excerpts for European destinations."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urlencode
from catalog import download
from urllib.error import URLError
import time

# Product coverage includes microstates and transcontinental destinations.
# The second form supports common Russian questions such as «что посмотреть в …».
REGIONS = """AL Албания|Албании
AD Андорра|Андорре
AM Армения|Армении
AT Австрия|Австрии
AZ Азербайджан|Азербайджане
BY Беларусь|Беларуси|Белоруссия|Белоруссии
BE Бельгия|Бельгии
BA Босния и Герцеговина|Боснии и Герцеговине
BG Болгария|Болгарии
HR Хорватия|Хорватии
CY Кипр|Кипре
CZ Чехия|Чехии
DK Дания|Дании
EE Эстония|Эстонии
FI Финляндия|Финляндии
FR Франция|Франции
GE Грузия|Грузии
DE Германия|Германии
GR Греция|Греции
HU Венгрия|Венгрии
IS Исландия|Исландии
IE Ирландия|Ирландии
IT Италия|Италии
KZ Казахстан|Казахстане
XK Косово|Косове
LV Латвия|Латвии
LI Лихтенштейн|Лихтенштейне
LT Литва|Литве
LU Люксембург|Люксембурге
MT Мальта|Мальте
MD Молдова|Молдове|Молдавия|Молдавии
MC Монако
ME Черногория|Черногории
NL Нидерланды|Нидерландах|Голландия|Голландии
MK Северная Македония|Северной Македонии
NO Норвегия|Норвегии
PL Польша|Польше
PT Португалия|Португалии
RO Румыния|Румынии
RU Россия|России
SM Сан-Марино
RS Сербия|Сербии
SK Словакия|Словакии
SI Словения|Словении
ES Испания|Испании
SE Швеция|Швеции
CH Швейцария|Швейцарии
TR Турция|Турции
UA Украина|Украине
GB Великобритания|Великобритании|Соединённое Королевство
VA Ватикан|Ватикане"""
CITIES = """rome Рим|Риме
paris Париж|Париже
barcelona Барселона|Барселоне
prague Прага|Праге
vienna Вена|Вене
lisbon Лиссабон|Лиссабоне
berlin Берлин|Берлине
london Лондон|Лондоне
amsterdam Амстердам|Амстердаме
brussels Брюссель|Брюсселе
athens Афины|Афинах
budapest Будапешт|Будапеште
warsaw Варшава|Варшаве
stockholm Стокгольм|Стокгольме
oslo Осло
helsinki Хельсинки
copenhagen Копенгаген|Копенгагене
dublin Дублин|Дублине
madrid Мадрид|Мадриде
istanbul Стамбул|Стамбуле
tbilisi Тбилиси"""
API = "https://ru.wikivoyage.org/w/api.php?"
TOPICS = {"overview": ("", "Понять", "География"), "places": ("Достопримечательности", "Другие места назначения", "Города", "Районы"), "food": ("Еда", "Кухня")}

def destinations():
    for line in (REGIONS+"\n"+CITIES).splitlines():
        code, names = line.split(" ",1)
        yield code, names.split("|")

def excerpt(paragraphs):
    lines = []
    for paragraph in paragraphs:
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
            if not sentence or len(sentence) > 700:
                continue
            if sum(map(len,lines))+len(sentence)>750:
                return " ".join(lines)
            lines.append(sentence if sentence[-1] in ".!?" else sentence+".")
    return " ".join(lines)

def wiki(params,api=API):
    url=api+urlencode(params)
    for attempt in range(4):
        try:
            return json.loads(download(url))
        except URLError:
            if attempt==3:
                raise
            time.sleep(2**attempt)

# Some Wikivoyage articles contain an empty sights heading. Select a named
# attraction in that destination and cite its own article for that topic.
LANDMARKS = {"CZ":"Карлов мост","VA":"Собор Святого Петра","vienna":"Шёнбрунн",
             "amsterdam":"Рейксмюсеум","brussels":"Гран-плас","oslo":"Оперный театр Осло",
             "copenhagen":"Нюхавн","madrid":"Музей Прадо"}

def add_landmark(doc):
    if "places" in doc["sections"] or doc["code"] not in LANDMARKS:
        return doc
    title=LANDMARKS[doc["code"]]
    params=dict(action="query",prop="extracts|info",explaintext=1,exintro=1,inprop="url",
                titles=title,redirects=1,format="json",formatversion=2)
    page=wiki(params,"https://ru.wikipedia.org/w/api.php?")["query"]["pages"][0]
    passage=excerpt(page.get("extract","").splitlines())
    if not passage:
        raise ValueError("Missing landmark article: "+title)
    doc["sections"]["places"]=passage
    doc["places_url"]="https://ru.wikipedia.org/w/index.php?oldid="+str(page["lastrevid"])
    doc["places_authors"]=page["fullurl"]+"?action=history"
    return doc

def fetch_guides():
    info=wiki(dict(action="query",meta="siteinfo",siprop="rightsinfo",format="json"))
    license_info=info["query"]["rightsinfo"]
    checked=datetime.now(timezone.utc).isoformat()
    def fetch(item):
        code, aliases=item
        title=aliases[0]
        params=dict(action="query",prop="extracts|info",explaintext=1,inprop="url",titles=title,
                    redirects=1,format="json",formatversion=2)
        page=wiki(params)["query"]["pages"][0]
        sections={"":[]}
        heading=""
        parent=""
        for line in page.get("extract","").splitlines():
            if line.startswith("=="):
                heading=line.strip("= ")
                if not line.startswith("==="):
                    parent=heading
            elif line.strip():
                sections.setdefault(heading,[]).append(line.strip())
                if parent!=heading and parent in ("Достопримечательности","Города","Еда","Районы"):
                    sections.setdefault(parent,[]).append(line.strip())
        content={}
        for key, headings in TOPICS.items():
            value=excerpt(line for h in headings for line in sections.get(h,[]))
            if value:
                content[key]=value
        if not content.get("overview"):
            raise ValueError("Missing guide for "+title)
        return add_landmark(dict(id="G"+str(page["pageid"]),source_id=str(page["pageid"]),kind="guide",code=code,
                    name=aliases[0],aliases=aliases,sections=content,checked=checked,
                    url="https://ru.wikivoyage.org/w/index.php?oldid="+str(page["lastrevid"]),
                    authors=page["fullurl"]+"?action=history",license=license_info["text"],
                    license_url=license_info["url"]))
    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(fetch,destinations()))
