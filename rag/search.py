"""BM25 over source facts. Rewriting and expansion are independently switchable."""
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from itertools import zip_longest
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from venues import LABELS as VENUE_LABELS, LODGING

CUISINE_NAMES = {
    "coffee_shop": "кофе", "teahouse": "чайная", "tea": "чай",
    "cake": "десерты", "breakfast": "завтраки", "bubble_tea": "бабл-ти",
    "regional": "региональная", "local": "местная", "international": "международная",
    "italian": "итальянская", "french": "французская", "vietnamese": "вьетнамская",
    "chinese": "китайская", "spanish": "испанская", "portuguese": "португальская",
    "georgian": "грузинская", "indian": "индийская", "thai": "тайская",
    "turkish": "турецкая", "asian": "азиатская", "mediterranean": "средиземноморская",
    "austrian": "австрийская", "american": "американская",
    "pizza": "пицца", "italian_pizza": "итальянская пицца",
    "pasta": "паста", "fish": "рыба", "tapas": "тапас", "catalan": "каталонская",
}
CUISINE_STEMS = {"каталонск":"catalan", "итальянск":"italian", "грузинск":"georgian",
                 "французск":"french", "вьетнамск":"vietnamese", "китайск":"chinese",
                 "испанск":"spanish", "португальск":"portuguese"}

def cuisine_labels(tags):
    return [CUISINE_NAMES.get(tag, tag.replace("_", " ")) for value in tags.split(";") if (tag := value.strip())]

def tokens(text):
    plain = unicodedata.normalize("NFKD", text.casefold().replace("ё","е"))
    return re.findall(r"[^\W_]+", "".join(c for c in plain if not unicodedata.combining(c)))

def facts(d):
    if d["kind"]=="city_context":
        return {"context": d["summary"]}
    if d["kind"]=="guide":
        return d["sections"]
    if d["kind"]=="venue":
        return {"venue": d["name"], "category": VENUE_LABELS[d["category"]],
                "address": d["address"], "food": " ".join(cuisine_labels(d.get("cuisine", "")))}
    if d["kind"]=="museum":
        return {"address":d["address"],"themes":d["themes"],"website":d["website"],"coordinates":d["coordinates"]}
    return {"event":(d.get("title_ru")+" / " if d.get("title_ru") else "")+d["name"],"price":d["price"],"period":d["start"][:10]+" — "+d["end"][:10]}

LABEL = dict(context="О месте", overview="Путеводитель", places="Достопримечательности и города", food="Местная кухня", venue="Заведение", category="Категория", address="Адрес", themes="Тематика", website="Сайт", coordinates="Координаты",
             event="Событие", price="Категория стоимости",period="Период по афише")
INTENTS = {
    "address":r"адрес|где наход|где располож|как найти",
    "themes":r"тематик|коллекци|специализ|профил",
    "website":r"сайт|веб.страниц", "coordinates":r"координат",
    "event":r"событи|афиш|мероприяти|выставк|мастер.класс|концерт|что (?:там |здесь )?(?:проходит|идет|идёт)",
    "price":r"бесплат|платн", "period":r"период|даты событий",
}
UNSUPPORTED = r"билет|скидк|льгот|наличи|открыт|закрыт|расписани|часов|часа|стоит|стоимость|сколько|цен[ауые]|детям|возраст|погод|брони|\d{1,4}[./-]\d"
OTHER_CITY = r"\b(?:рим[ае]?|праг[аеу]|вен[аеу]|барселон[аеу]|лиссабон[ае]?|лондон[ае]?|берлин[ае]?)\b"
CITY_CONTEXT_TOPICS = {
    "football": r"\b(?:матч\w*|футбол\w*|стадион\w*)\b",
    "music": r"музык|концерт|оркестр|филармон|фаду|джаз",
    "film": r"кино|съем|съём|фильм",
    "engineering": r"инженер|электростан|промышлен|как постро|мост\w*",
    "architecture": r"архитектур|барочн|библиотек",
    "history": r"подзем|бункер|городск\w* истор",
}
CONTEXT_CITIES = {
    "liverpool": r"ливерпул\w*|liverpool",
    "manchester": r"манчестер\w*|manchester",
    "milan": r"милан\w*|milan",
    "munich": r"мюнхен\w*|munich",
    "dortmund": r"дортмунд\w*|dortmund",
}
EVENT_TOPICS = (
    ("football", CITY_CONTEXT_TOPICS["football"]),
    ("theatre", r"\b(?:театр\w*|спектакл\w*|опер[ауые]|мюзикл\w*|балет\w*)\b"),
)
THEATRE_SOURCES = {
    "barcelona": ("Барселона", "Teatre Nacional de Catalunya", "https://www.tnc.cat/en/temporada-2026-2027"),
    "vienna": ("Вена", "Венская государственная опера", "https://www.wiener-staatsoper.at/en/calendar/"),
    "paris": ("Париж", "Парижская опера", "https://www.operadeparis.fr/en"),
    "prague": ("Прага", "Национальный театр", "https://www.narodni-divadlo.cz/en/programme"),
}

def event_topic(messages):
    question = messages[-1]["content"].casefold()
    for topic, pattern in EVENT_TOPICS:
        if re.search(pattern,question):
            return topic
    if len(messages) >= 3 and messages[-2]["role"] == "assistant":
        previous = messages[-2]["content"]
        if previous.startswith(("ФК «Барселона»","Какой матч хотите","• ")) and "арена" in previous.casefold() and re.fullmatch(
            r"(?:а\s+)?(?:когда(?: ближайший)?|где(?: он проходит)?|(?:есть )?билеты|сколько стоят билеты|завтра|на\s+\d[\w./ -]*|барс[аыуе]|\d[\w./ -]*)[.!?]?",
            question.strip(),
        ):
            return "football"
        if previous.startswith("В каком городе хотите сходить в театр") and re.fullmatch(r"(?:(?:в|во)\s+)?[\w-]+[.!?]?",question.strip()):
            return "theatre"
    return None

class Index:
    def __init__(self, docs):
        self.docs = {d["id"]:d for d in docs}
        self.museums = {d["place"]:d for d in docs if d["kind"]=="museum"}
        self.guides = {d["id"]:d for d in docs if d["kind"]=="guide"}
        self.city_context = {d["id"]:d for d in docs if d["kind"]=="city_context"}
        self.venues = {d["id"]:d for d in docs if d["kind"]=="venue"}
        self.city_guides = {d["code"]:d for d in self.guides.values() if d["code"].islower()}
        self.postings = defaultdict(dict)
        self.lengths = {}
        self.aliases = {}
        for place,d in self.museums.items():
            forms = [d["alias"],d["name"],d["venue"],d["official"]]
            self.aliases[place] = [tokens(s) for s in forms if s]
        for d in docs:
            fields = facts(d)
            if d["kind"]=="venue":
                guide = self.city_guides[d["code"]]
                names = self.guide_forms(guide) + (["жильё проживание размещение"] if d["category"] in LODGING else ["поесть перекусить"])
            elif d["kind"]=="city_context":
                names = [d["name"], *d["aliases"], d["code"]]
            elif d["kind"]=="guide":
                names = d["aliases"]
            else:
                names = [d["alias"],d["venue"],d["name"]]
            words = tokens(" ".join(names+
                [LABEL[k]+" "+str(v) for k,v in fields.items() if v]))
            self.lengths[d["id"]] = len(words)
            for word,count in Counter(words).items():
                self.postings[word][d["id"]] = count
        self.avg = sum(self.lengths.values())/len(self.docs)

    def places(self,text):
        phrase = " "+" ".join(tokens(text))+" "
        found = {p for p,forms in self.aliases.items() if any(" "+" ".join(f)+" " in phrase for f in forms)}
        for stem,place in [("лувр","M5031"),("бурдел","M1103"),("цадкин","M1115"),("роден","M5044")]:
            if any(w.startswith(stem) for w in phrase.split()):
                found.add(place)
        if re.search(r"мал(?:ый|ого|ом) двор(?:ец|ца|це)",phrase):
            found.add("M1111")
        return found

    def rank(self, query, allowed, k):
        scores = defaultdict(float)
        for term in dict.fromkeys(tokens(query)):
            postings = self.postings.get(term,{})
            idf = math.log1p((len(self.docs)-len(postings)+0.5)/(len(postings)+0.5))
            for key,tf in postings.items():
                if key in allowed:
                    scores[key] += idf*tf*2.2/(tf+1.2*(.25+.75*self.lengths[key]/self.avg))
        return sorted(scores,key=lambda key:(-scores[key],key))[:k]

    def guide_forms(self,d):
        forms=list(d["aliases"])
        name=d["name"]
        if " " not in name and name.endswith("ия"):
            forms.append(name[:-1]+"ю")
        elif " " not in name and name.endswith("а"):
            forms.append(name[:-1]+"у")
            if d["code"].islower():
                forms.append(name[:-1]+("и" if name[-2] in "гкхжчшщ" else "ы"))
        elif d["code"].islower() and len(forms)>1 and forms[1]==name+"е":
            forms.extend((name+"у", name+"а"))
        return forms

    def guide_ids(self,text):
        phrase=" "+" ".join(tokens(text))+" "
        return {key for key,d in self.guides.items() if any(
            " "+" ".join(tokens(alias))+" " in phrase for alias in self.guide_forms(d))}

    def airports_for(self, text, city="", *, named_only=False):
        phrase = " "+" ".join(tokens(text))+" "
        airports = [d for d in self.city_context.values() if d["topic"]=="airport"]
        named = [d for d in airports if any(
            " "+" ".join(tokens(alias))+" " in phrase for alias in d["aliases"])]
        if named or named_only:
            return named
        guides = self.guide_ids(text)
        codes = {self.guides[key]["code"] for key in guides if self.guides[key]["code"].islower()}
        codes.update(code for code,pattern in CONTEXT_CITIES.items()
                     if re.search(r"\b(?:"+pattern+r")\b",text.casefold()))
        if not codes and city and not guides:
            codes.add(city)
        return [d for d in airports if d["code"] in codes]

    def city_context_reply(self,messages,city="",k=5):
        question = messages[-1]["content"].casefold()
        phrase = " "+" ".join(tokens(question))+" "
        cities = {self.guides[key]["code"] for key in self.guide_ids(question)
                  if self.guides[key]["code"].islower()}
        cities.update(code for code,pattern in CONTEXT_CITIES.items() if re.search(r"\b(?:"+pattern+r")\b",question))
        topic = {name for name,pattern in CITY_CONTEXT_TOPICS.items() if re.search(pattern,question)}
        if event_topic(messages) == "football":
            topic.add("football")
        broad = re.search(r"необычн|скрыт\w* мест|небанальн|что интересного|интересн\w* факт",question)
        local = [d for d in self.city_context.values() if d["topic"]!="airport" and (not cities or d["code"] in cities)]
        exact = [d for d in local if any(
            " "+" ".join(tokens(alias))+" " in phrase for alias in (d["name"],*d["aliases"]))
            and (not topic or d["topic"] in topic)]
        if not topic and not broad and re.search(r"ресторан|кафе|отел|гостиниц|где (?:там )?поесть",question):
            return None
        if not exact and not topic and not broad:
            return None
        if not cities and not exact:
            for message in reversed(messages[:-1]):
                previous = {self.guides[key]["code"] for key in self.guide_ids(message["content"])
                            if self.guides[key]["code"].islower()}
                previous.update(code for code,pattern in CONTEXT_CITIES.items()
                                if re.search(r"\b(?:"+pattern+r")\b",message["content"].casefold()))
                if previous:
                    cities = previous
                    break
            if not cities and city:
                cities.add(city)
        if exact:
            hits = [d["id"] for d in exact]
        elif cities:
            allowed = {d["id"] for d in local if d["code"] in cities and (
                d["topic"] in topic if topic else d["topic"] != "football")}
            hits = self.rank(question,allowed,k)
            hits.extend(sorted(allowed-set(hits)))
        else:
            hits = []
        if not hits:
            return None
        lines, sources = [], []
        for key in hits[:k]:
            doc = self.city_context[key]
            lines.append(f"• {doc['name']}. {doc['summary']}")
            sources.append(dict(id=key,credit=doc["name"],url=doc["url"]))
            if doc.get("calendar") and re.search(r"матч|билет|календар|футбол",question):
                sources.append(dict(id=key+"-CAL",credit="Календарь и билеты клуба",url=doc["calendar"]))
        if re.search(r"билет|когда|расписан|сегодня|завтра",question):
            lines.append("Актуальные даты, место проведения и условия посещения сверяйте на сайте организатора.")
        return dict(mode="official",status="answered",reply="\n".join(lines),sources=sources,hits=hits[:k])

    def event_reply(self,messages,city):
        topic = event_topic(messages)
        if topic is None:
            return None
        question = messages[-1]["content"].casefold()
        response = dict(mode="official",status="insufficient",sources=[],hits=[])
        if topic == "football":
            return dict(
                response, reply="Уточните клуб или город. Если знаете дату матча, укажите её.")

        destinations = self.guide_ids(question)
        codes = {self.guides[key]["code"] for key in destinations if self.guides[key]["code"].islower()}
        if not destinations and city and not re.search(r"\b(?:в|во)\s+\w+",question):
            codes.add(city)
        if len(codes) != 1:
            response["reply"]="В каком городе хотите сходить в театр? Если знаете дату или жанр, укажите их."
            return response
        code = next(iter(codes))
        theatre = THEATRE_SOURCES.get(code)
        if theatre is None:
            response["reply"]="У меня пока нет проверенной ссылки на театральную афишу этого города. Если уже выбрали театр, проверьте расписание и билеты на его официальном сайте."
            return response
        name, venue, url = theatre
        response.update(status="answered",
                        reply=f"Театр · {name}. Посмотрите программу «{venue}» на официальном сайте. Там можно сверить даты и условия покупки билетов.",
                        sources=[dict(id="THEATRE",credit=f"Афиша · {venue}",url=url)])
        return response

    def venue_reply(self, query, messages, city, rewrite, expand, k):
        destination_reply = self.guide_ids(query)
        if rewrite and destination_reply and len(messages) >= 3:
            previous = messages[-2]
            if previous["role"] == "assistant" and previous["content"].startswith("Уточните город, где искать"):
                query = messages[-3]["content"].casefold() + " " + query
        groups = []
        if re.search(r"кафе|кофейн|где .*кофе", query):
            groups.append({"cafe"})
        if "ресторан" in query:
            groups.append({"restaurant"})
        if not groups and re.search(r"где (?:там |можно |лучше )?(?:поесть|перекусить|пообедать|поужинать|позавтракать)", query):
            groups.append({"cafe", "restaurant"})
        lodging = {category for category, pattern in {
            "hotel": r"отел|гостиниц", "hostel": r"хостел",
            "guest_house": r"гостев\w* дом", "apartment": r"апартамент",
        }.items() if re.search(pattern, query)}
        if lodging:
            groups.append(lodging)
        elif re.search(r"жиль[еяё]|остановиться|переночевать|поселиться|проживани|ночлег", query):
            groups.append(LODGING)
        if not groups:
            return None
        cuisines = {tag for stem,tag in CUISINE_STEMS.items() if stem in query}

        if re.search(r"завтра|сегодня|недорог|дешев|бюджет|по цене|свободн.*(?:номер|мест)|\d+\s*(?:€|руб|евро)", query):
            return dict(reply="В корпусе нет подтверждённого ответа о ценах, работе на конкретную дату или свободных местах.",
                        sources=[], hits=[], status="insufficient")
        destinations = self.guide_ids(query)
        clarification = dict(reply="Уточните город, где искать кафе, рестораны или жильё.",
                             sources=[], hits=[], status="insufficient")
        # An explicit unknown destination must not be replaced by the trip's city.
        explicit = re.search(r"\b(?:в|во|по|для)\s+\w+", query)
        contextual = not explicit or re.search(r"в этом городе|в текущем городе", query)
        if not destinations and contextual and rewrite:
            for message in reversed(messages[:-1]):
                if message["role"] == "assistant" and message["content"].startswith("Уточните город, где искать"):
                    return clarification
                if message["role"] == "user":
                    destinations = self.guide_ids(message["content"])
                    if destinations:
                        break
        codes = {self.guides[key]["code"] for key in destinations if self.guides[key]["code"].islower()}
        if not destinations and contextual and city in self.city_guides:
            codes.add(city)
        if not codes:
            return clarification

        search_query = query
        if rewrite:
            search_query += " " + " ".join(self.city_guides[code]["name"] for code in sorted(codes))
        if expand:
            search_query += " " + " ".join(VENUE_LABELS[category] for category in sorted(set().union(*groups)))
        ranked_groups = [
            (code, group, self.rank(search_query, {
                 key for key, venue in self.venues.items()
                 if venue["code"] == code and venue["category"] in group
                 and (not cuisines or venue["category"] in LODGING
                      or cuisines.intersection(venue.get("cuisine","").split(";")))
             }, k))
            for group in groups for code in sorted(codes)
        ]
        hits = list(dict.fromkeys(key for column in zip_longest(*(ranked for _, _, ranked in ranked_groups))
                                  for key in column if key))[:k]
        if not hits:
            message = ("В корпусе нет подтверждённых заведений с этой кухней в выбранном городе." if cuisines else
                       "В корпусе нет подтверждённых вариантов этого типа для выбранного города.")
            return dict(reply=message,
                        sources=[], hits=[], status="insufficient")

        lines = ["Куда сходить:"]
        sources = []
        for key in hits:
            venue = self.venues[key]
            fields = [self.city_guides[venue["code"]]["name"], VENUE_LABELS[venue["category"]], venue["name"]]
            if venue["address"]:
                fields.append(venue["address"])
            if venue.get("cuisine"):
                fields.append("кухня: " + ", ".join(cuisine_labels(venue["cuisine"])))
            lines.append(" · ".join(fields) + f" [{key}]")
            source = dict(id=key, url=venue["url"], checked=venue["checked"])
            if venue.get("credit"):
                source["credit"] = venue["credit"]
            else:
                source.update(credit="© OpenStreetMap contributors",
                              attribution_url="https://www.openstreetmap.org/copyright")
            sources.append(source)
        for code, group, ranked in ranked_groups:
            if not ranked:
                types = ", ".join(VENUE_LABELS[category].lower() for category in sorted(group))
                lines.append(f'{self.city_guides[code]["name"]} · нет данных в категориях: {types}.')
        return dict(reply="\n".join(lines), sources=sources, hits=hits, status="answered", mode="directory")

    def guide_reply(self,q,messages,city,rewrite,expand,k):
        ids=self.guide_ids(q)
        topic=None
        for field,pattern in (("food","кухн|что (?:там )?попробовать|местн.*ед"),("places","куда сходить|что посетить|что интересного|маршрут|что (?:там )?посмотреть|достопримечательност|какие города|куда съездить"),
                              ("overview","(?:еду|хочу|поеду) в |поездка в |путеводител|расскажи|кратк.*обзор|чем (?:известн|интересн|знаменит)")):
            if re.search(pattern,q):
                topic=field
                break
        if not topic:
            return None
        if not ids and rewrite and re.search(r"там|в этой стране|^а |^что посмотреть[?]?$",q):
            for previous in reversed(messages[:-1]):
                if previous["role"]=="user":
                    ids=self.guide_ids(previous["content"])
                    if ids:
                        break
            if not ids:
                ids={key for key,d in self.guides.items() if d["code"]==city}
        if not ids:
            return dict(reply="Уточните страну или город для путеводителя.",sources=[],hits=[],status="insufficient")
        query=q
        if rewrite:
            query+=" "+" ".join(self.guides[key]["name"] for key in sorted(ids))
        if expand:
            query+=" "+LABEL[topic]
        hits=self.rank(query,{key for key in ids if topic in self.guides[key]["sections"]},k)
        lines=[]
        sources=[]
        required={}
        for key in hits:
            d=self.guides[key]
            passage=d["sections"][topic]
            lines.append(d["name"]+" — "+passage+" ["+key+"]")
            url=d.get("places_url",d["url"]) if topic=="places" else d["url"]
            sources.append(dict(id=key,url=url,checked=d["checked"],credit="Википедия" if url==d.get("places_url") else "Викигид",license_url=d["license_url"]))
            required[key]=[passage.split(". ")[0][:90].strip(". ")]
        for key in sorted(ids-set(hits)):
            lines.append(self.guides[key]["name"]+" — по этой теме подтверждённого фрагмента в выдаче нет.")
        return dict(reply="\n".join(lines),sources=sources,hits=hits,required=required,
                    query=query,status="answered" if sources else "insufficient")

    def ask(self,messages,city="",rewrite=True,expand=True,k=5,now=None):
        q = messages[-1]["content"].casefold()
        context_reply = self.city_context_reply(messages,city,k)
        if context_reply is not None:
            return context_reply
        event = self.event_reply(messages,city)
        if event is not None:
            return event
        def stop(message):
            return dict(reply=message,sources=[],hits=[],status="insufficient")
        unknown = stop("В корпусе нет подтверждённого ответа на этот вопрос.")
        if re.search(UNSUPPORTED,q):
            return unknown
        venue=self.venue_reply(q,messages,city,rewrite,expand,k)
        if venue is not None:
            return venue
        guide=self.guide_reply(q,messages,city,rewrite,expand,k)
        if guide is not None:
            return guide
        if not self.guide_ids(q) and not self.places(q) and re.search(r"там|туда|этой стране|этом городе",q):
            for message in reversed(messages[:-1]):
                if message["role"]!="user":
                    continue
                previous=self.guide_ids(message["content"])
                if self.places(message["content"]):
                    break
                if previous:
                    if any(self.guides[key]["code"] not in ("FR","paris") for key in previous):
                        return unknown
                    break
        if re.search(OTHER_CITY,q) or any(self.guides[key]["code"] not in ("FR","paris") for key in self.guide_ids(q)):
            return unknown
        places = self.places(q)
        fields = [key for key,pattern in INTENTS.items() if re.search(pattern,q)]
        if not fields and places and rewrite and len(messages)>=3:
            prompt=messages[-2]["content"]
            if messages[-2]["role"]=="assistant" and prompt.startswith(("Уточните название","Какой из упомянутых")):
                original=messages[-3]["content"].casefold()
                fields=[key for key,pattern in INTENTS.items() if re.search(pattern,original)]
                q=original+" "+q
        if not fields:
            return unknown
        if not places and rewrite and re.search(r"там|туда|него|этот|этом|этого|^а (?:адрес|сайт|координаты|тематика)",q):
            for previous in reversed(messages[:-1]):
                if previous["role"]!="user":
                    continue
                if re.search(OTHER_CITY,previous["content"].lower()):
                    return unknown
                places = self.places(previous["content"])
                if places:
                    if len(places)>1:
                        return stop("Какой из упомянутых музеев вы имеете в виду?")
                    break
        if not places and city not in ("","paris") and "париж" not in q:
            return unknown
        event = "event" in fields or "period" in fields or ("price" in fields and "что" in q)
        if now is None:
            try:
                now=datetime.now(ZoneInfo("Europe/Paris"))
            except ZoneInfoNotFoundError:
                now=datetime.now().astimezone()
        moment = now
        day = None
        if "завтра" in q:
            day = moment.date()+timedelta(days=1)
        elif "сегодня" in q:
            day = moment.date()
        else:
            for weekday,stem in enumerate(("понедельник","вторник","среду","четверг","пятниц","суббот","воскресень")):
                if stem in q:
                    day = moment.date()+timedelta(days=(weekday-moment.weekday())%7)
                    break
        if day and not event:
            return unknown
        if "price" in fields and not event:
            return stop("Уточните событие и площадку. В афише указана категория стоимости мероприятия.")
        if event and not places and re.search(r"музе[ея]|галере|эрмитаж",q):
            return stop("Уточните название площадки из парижского корпуса.")
        if not places and not event:
            return stop("Уточните название музея в Париже.")
        query = q
        if rewrite:
            query += " "+" ".join(self.museums[p]["alias"] for p in sorted(places))
        if expand:
            query += " "+" ".join(LABEL[f] for f in fields)
            query += " "+" ".join(self.museums[p]["venue"] for p in sorted(places))
        tag_patterns={"Expo":"выставк","Atelier":"мастер.класс","Concert":"концерт","Enfants":"детск|для детей"}
        tags={tag for tag,pattern in tag_patterns.items() if re.search(pattern,q)} if event else set()
        quoted=re.findall(r'[«"]([^»"]+)[»"]',q) if event else []
        topic=re.search(r"(?:по теме|на тему|\bпро|\bоб?)\s+(.+?)[?.!]*$",q) if event else None
        if topic:
            quoted.append(topic.group(1).strip(" «»"))
        allowed = set()
        for key,d in self.docs.items():
            if d["kind"] in ("guide","venue","city_context"):
                continue
            if places and d["place"] not in places or event != (d["kind"]=="event"):
                continue
            if tags and not tags.issubset(d.get("tags",[])):
                continue
            if quoted and not all(" ".join(tokens(title)) in " ".join(tokens(d["name"]+" "+d.get("title_ru",""))) for title in quoted):
                continue
            if day and day.isoformat() not in d.get("days",[]):
                continue
            if event and datetime.fromisoformat(d["end"]) < moment:
                continue
            if "бесплат" in q and d.get("price")!="бесплатный":
                continue
            if "платн" in q and "бесплат" not in q and d.get("price")!="платный":
                continue
            allowed.add(key)
        hits = self.rank(query,allowed,k)
        if not hits:
            return unknown
        sources,lines = [],[]
        required = {}
        for key in hits:
            d = self.docs[key]
            values = facts(d)
            selected = list(values) if event else fields
            evidence = [LABEL[f]+": "+values[f] for f in selected if values.get(f)]
            if day:
                evidence.append("Дата в афише: "+day.isoformat())
            if not evidence:
                continue
            required[key] = [d["name"]] if event else [values[f] for f in selected if values.get(f)]
            if event and "price" in fields:
                required[key].append(d["price"])
            if day:
                required[key].append(day.isoformat())
            if "period" in fields:
                required[key].extend((d["start"][:10],d["end"][:10]))
            lines.append(f"{d['alias']} — "+". ".join(evidence)+f" [{key}]")
            sources.append(dict(id=key,url=d["url"],checked=d["checked"]))
        if not lines:
            return unknown
        return dict(reply="\n".join(lines),sources=sources,hits=hits,status="answered",query=query,required=required)

