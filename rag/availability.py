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


PROVIDERS = {"paris-2": cruise_slots, "paris-9": cruise_slots}
