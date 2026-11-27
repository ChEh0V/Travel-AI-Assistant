"""Build a compact ODbL snapshot of named city venues from OpenStreetMap."""

import argparse
import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

from catalog import download

ENDPOINT = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
SNAPSHOT = Path(__file__).with_name("venues.json")
CENTERS = {
    "rome": (41.8986, 12.4769), "paris": (48.8566, 2.3522),
    "barcelona": (41.3851, 2.1734), "prague": (50.0870, 14.4213),
    "vienna": (48.2082, 16.3738), "lisbon": (38.7139, -9.1394),
    "berlin": (52.5163, 13.3973), "london": (51.5080, -0.1281),
    "amsterdam": (52.3731, 4.8926), "brussels": (50.8467, 4.3525),
    "athens": (37.9755, 23.7349), "budapest": (47.4967, 19.0538),
    "warsaw": (52.2470, 21.0141), "stockholm": (59.3259, 18.0713),
    "oslo": (59.9110, 10.7512), "helsinki": (60.1699, 24.9414),
    "copenhagen": (55.6778, 12.5710), "dublin": (53.3440, -6.2651),
    "madrid": (40.4168, -3.7038), "istanbul": (41.0086, 28.9802),
    "tbilisi": (41.6934, 44.8015),
}
LABELS = {
    "cafe": "Кафе", "restaurant": "Ресторан", "hotel": "Отель",
    "hostel": "Хостел", "guest_house": "Гостевой дом",
    "apartment": "Апартаменты",
}
LODGING = {"hotel", "hostel", "guest_house", "apartment"}


def fetch_city(city, checked):
    lat, lon = CENTERS[city]
    filters = (("amenity", "cafe"), ("amenity", "restaurant"),
               ("tourism", "^(hotel|hostel|guest_house|apartment)$"))
    searches = "".join(
        f'nwr["{key}"~"{category}"]["name"](around:2500,{lat},{lon});out center;'
        for key, category in filters
    )
    url = ENDPOINT + "?" + urlencode({"data": "[out:json][timeout:25];" + searches})
    for attempt in range(3):
        try:
            data = json.loads(download(url))
            break
        except (URLError, TimeoutError) as error:
            if attempt == 2 or isinstance(error, HTTPError) and error.code not in (429, 502, 503, 504):
                raise
            retry_after = error.headers.get("Retry-After", "") if isinstance(error, HTTPError) else ""
            time.sleep(int(retry_after) if retry_after.isdecimal() else 3 * (attempt + 1))
    if data.get("remark"):
        raise ValueError(f"{city}: incomplete response from Overpass")
    groups = {key: [] for key in ("cafe", "restaurant", "lodging")}
    for item in data["elements"]:
        tags = item["tags"]
        category = tags.get("amenity") if tags.get("amenity") in ("cafe", "restaurant") else tags.get("tourism")
        position = item.get("center", item)
        if category not in LABELS or "lat" not in position:
            continue
        name = " ".join(tags["name"].split())
        if not name:
            continue
        address = " ".join(tags.get(k, "") for k in ("addr:street", "addr:housenumber")).strip()
        source = f'{item["type"]}/{item["id"]}'
        record = dict(
            id=f'V{dict(node=1, way=2, relation=3)[item["type"]]}{item["id"]}',
            kind="venue", code=city, category=category, name=name, address=address,
            coordinates=[position["lat"], position["lon"]], source_id=source,
            url="https://www.openstreetmap.org/" + source, checked=checked,
        )
        if category not in LODGING and tags.get("cuisine"):
            record["cuisine"] = tags["cuisine"]
        distance = (position["lat"]-lat)**2 + ((position["lon"]-lon)*math.cos(math.radians(lat)))**2
        groups["lodging" if category in LODGING else category].append((distance, record))

    results = []
    for kind, candidates in groups.items():
        selected = []
        seen = set()
        # Select distinct names. For housing, include non-hotel categories when available.
        types = set()
        ordered = sorted(candidates, key=lambda entry: (entry[0], entry[1]["id"]))
        if kind == "lodging":
            for _, record in ordered:
                name = record["name"].casefold()
                if record["category"] not in types and name not in seen:
                    selected.append(record)
                    seen.add(name)
                    types.add(record["category"])
        for _, record in ordered:
            if len(selected) == 6:
                break
            name = record["name"].casefold()
            if name not in seen:
                selected.append(record)
                seen.add(name)
        if len(selected) < 3:
            raise ValueError(f"{city}: only {len(selected)} records for {kind}")
        results.extend(selected)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=SNAPSHOT)
    options = parser.parse_args()
    checked = datetime.now(timezone.utc).date().isoformat()
    venues = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = pool.map(lambda city: fetch_city(city, checked), CENTERS)
        for city, records_by_city in zip(CENTERS, records):
            venues.extend(records_by_city)
            print(f"{city}: {len(records_by_city)} records collected", flush=True)
    with NamedTemporaryFile(mode="w", dir=options.out.parent, encoding="utf-8", delete=False) as output:
        json.dump(venues, output, ensure_ascii=False, indent=2)
        output.write("\n")
    os.replace(output.name, options.out)
