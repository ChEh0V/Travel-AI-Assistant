"""BM25 over source facts. Rewriting and expansion are independently switchable."""
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

def tokens(text):
    plain = unicodedata.normalize("NFKD", text.casefold().replace("ё","е"))
    return re.findall(r"[^\W_]+", "".join(c for c in plain if not unicodedata.combining(c)))

def facts(d):
    if d["kind"]=="guide":
        return d["sections"]
    if d["kind"]=="museum":
        return {"address":d["address"],"themes":d["themes"],"website":d["website"],"coordinates":d["coordinates"]}
    return {"event":(d.get("title_ru")+" / " if d.get("title_ru") else "")+d["name"],"price":d["price"],"period":d["start"][:10]+" — "+d["end"][:10]}

LABEL = dict(overview="Путеводитель", places="Достопримечательности и города", food="Местная кухня", address="Адрес", themes="Тематика", website="Сайт", coordinates="Координаты",
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

class Index:
    def __init__(self, docs):
        self.docs = {d["id"]:d for d in docs}
        self.museums = {d["place"]:d for d in docs if d["kind"]=="museum"}
        self.guides = {d["id"]:d for d in docs if d["kind"]=="guide"}
        self.postings = defaultdict(dict)
        self.lengths = {}
        self.aliases = {}
        for place,d in self.museums.items():
            forms = [d["alias"],d["name"],d["venue"],d["official"]]
            self.aliases[place] = [tokens(s) for s in forms if s]
        for d in docs:
            fields = facts(d)
            names = d["aliases"] if d["kind"]=="guide" else [d["alias"],d["venue"],d["name"]]
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
        elif d["code"].islower() and len(forms)>1 and forms[1]==name+"е":
            forms.append(name+"у")
        return forms

    def guide_ids(self,text):
        phrase=" "+" ".join(tokens(text))+" "
        return {key for key,d in self.guides.items() if any(
            " "+" ".join(tokens(alias))+" " in phrase for alias in self.guide_forms(d))}

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
        def stop(message):
            return dict(reply=message,sources=[],hits=[],status="insufficient")
        unknown = stop("В корпусе нет подтверждённого ответа на этот вопрос.")
        if re.search(UNSUPPORTED,q):
            return unknown
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
            if d["kind"]=="guide":
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

