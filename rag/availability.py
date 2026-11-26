"""Read-only availability from the operator's public booking calendar."""
import json
import re
from datetime import date
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class SlotOptions(HTMLParser):
    def __init__(self, people):
        super().__init__()
        self.people = people
        self.times = set()

    def handle_starttag(self, tag, attributes):
        if tag != "option":
            return
        attrs = dict(attributes)
        time = attrs.get("data-horaire", "")
        stock = attrs.get("data-stock", "")
        if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", time) and stock.isdecimal():
            if int(stock) >= self.people:
                self.times.add(time)


def cruise_slots(visit_date, people):
    day = date.fromisoformat(visit_date)
    if day.isoformat() != visit_date or not 1 <= people <= 20:
        raise ValueError("Invalid date or number of guests")
    params = urlencode(dict(date=visit_date, produit=56, lg="en", catalogues=56))
    request = Request("https://www.vedettesdupontneuf.com/ajax/calendrier_produit.php?" + params,
                      headers={"Accept": "application/json"})
    with urlopen(request, timeout=8) as response:
        data = json.loads(response.read(200_000))
    if not isinstance(data, dict) or data.get("erreur") or data.get("date") != visit_date:
        raise ValueError("Invalid calendar response")
    if data.get("aucun_depart") is True:
        return [], None
    offer = next((offer for offer in data["offres"] if offer.get("id") == 56), None)
    if offer is None or not isinstance(offer.get("html_horaires"), str):
        raise ValueError("Missing cruise timetable")
    parser = SlotOptions(people)
    parser.feed(offer["html_horaires"])
    rates = [
        rate for rate in offer.get("grille", [])
        if isinstance(rate.get("pax_min"), int) and rate["pax_min"] <= people
        and isinstance(rate.get("adulte"), (int, float)) and 0 < rate["adulte"] < 10000
    ]
    price = None
    if rates:
        adult = max(rates, key=lambda rate: rate["pax_min"])["adulte"]
        price = {"currency": "EUR", "adult": adult, "total": round(adult * people, 2), "people": people}
    return sorted(parser.times), price


def prague_cruise_slots(visit_date, people):
    day = date.fromisoformat(visit_date)
    if day.isoformat() != visit_date or not 1 <= people <= 20:
        raise ValueError("Invalid date or number of guests")
    request = Request("https://www.prague-boats.cz/api/cruises-list",
                      headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    with urlopen(request, timeout=8) as response:
        data = json.loads(response.read(500_000))
    if not isinstance(data, list):
        raise ValueError("Invalid cruises response")
    cruise = next((item for item in data if item.get("id") == 17 or item.get("slug") == "/one-hour-river-cruise"), None)
    if cruise is None or not isinstance(cruise.get("availability"), list):
        raise ValueError("Missing Prague cruise timetable")
    times = set()
    adult = None
    for entry in cruise["availability"]:
        dep = entry.get("departure") if isinstance(entry, dict) else None
        if not isinstance(dep, dict):
            continue
        if dep.get("forSale") is not True or dep.get("availability") != "available":
            continue
        vacancies = dep.get("vacancies")
        if not isinstance(vacancies, int) or vacancies < people:
            continue
        stamp = dep.get("time", "")
        if not isinstance(stamp, str) or stamp[:10] != visit_date:
            continue
        hhmm = stamp[11:16]
        if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", hhmm):
            times.add(hhmm)
            if adult is None and isinstance(dep.get("adultPriceEur"), (int, float)) and 0 < dep["adultPriceEur"] < 10000:
                adult = dep["adultPriceEur"]
    if not times:
        return [], None
    if adult is None:
        fallback = (cruise.get("nereast") or {}).get("adultPriceEur")
        if isinstance(fallback, (int, float)) and 0 < fallback < 10000:
            adult = fallback
    price = {"currency": "EUR", "adult": adult, "total": round(adult * people, 2), "people": people} if adult else None
    return sorted(times), price


def hippotrip_slots(visit_date, people):
    day = date.fromisoformat(visit_date)
    if day.isoformat() != visit_date or not 1 <= people <= 20:
        raise ValueError("Invalid date or number of guests")
    headers = {
        "Authorization": "Bearer 198518e3-581b-4995-a4b5-fbb37840322a",
        "Octo-Capabilities": "octo/pricing",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": "https://www.hippotrip.com",
        "User-Agent": "Mozilla/5.0",
    }
    payload = json.dumps({
        "productId": "404f599f-6869-4a9f-b921-c60839fd70c9",
        "optionId": "3096d03e-5780-4cf2-b9f7-5aebe1f00f12",
        "localDateStart": visit_date,
        "localDateEnd": visit_date,
        "units": [{"id": "unit_aa50c8f0-18d7-43bf-bfbe-2bff4075a25e", "quantity": people}],
    }).encode()
    request = Request("https://checkout-api.ventrata.com/octo/availability", data=payload, headers=headers)
    with urlopen(request, timeout=8) as response:
        slots = json.loads(response.read(300_000))
    if not isinstance(slots, list):
        raise ValueError("Invalid Hippotrip response")
    times = set()
    adult = None
    for slot in slots:
        if not isinstance(slot, dict) or not slot.get("available"):
            continue
        vacancies = slot.get("vacancies")
        if isinstance(vacancies, int) and vacancies < people:
            continue
        stamp = slot.get("localDateTimeStart", "")
        if not isinstance(stamp, str) or stamp[:10] != visit_date:
            continue
        hhmm = stamp[11:16]
        if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", hhmm):
            times.add(hhmm)
            if adult is None:
                for unit in slot.get("unitPricing", []):
                    if unit.get("unitType") == "ADULT" and isinstance(unit.get("retail"), (int, float)):
                        precision = unit.get("currencyPrecision", 2)
                        adult = round(unit["retail"] / (10 ** precision), 2)
                        break
    if not times:
        return [], None
    price = {"currency": "EUR", "adult": adult, "total": round(adult * people, 2), "people": people} if adult else None
    return sorted(times), price


PROVIDERS = {
    "paris-2": cruise_slots,
    "paris-9": cruise_slots,
    "prague-9": prague_cruise_slots,
    "lisbon-9": hippotrip_slots,
}
