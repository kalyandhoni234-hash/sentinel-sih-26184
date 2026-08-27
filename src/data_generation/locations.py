"""Synthetic geographic environment generator.

Creates a deterministic set of locations across synthetic metro areas.
All coordinates and attributes are SYNTHETIC approximations for MVP purposes.
"""

from __future__ import annotations

import math
import random
from typing import Any

from .schema import Location, LocationType


# Deterministic offset patterns for generating sub-locations within a metro.
# These create realistic-ish spreads without claiming to be exact city maps.
_OFFSET_PATTERNS = [
    (0.02, 0.03),
    (-0.015, 0.025),
    (0.03, -0.01),
    (-0.02, -0.02),
    (0.01, 0.04),
    (-0.03, 0.015),
    (0.025, -0.025),
    (-0.01, -0.035),
    (0.035, 0.01),
    (-0.025, -0.01),
]

_REGION_NAMES = [
    "North", "South", "East", "West", "Central",
    "North-East", "South-West", "Industrial", "Financial", "Old Quarter",
]

_LOCATION_TYPE_CYCLE = list(LocationType)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance in km between two coordinates."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def generate_locations(
    geography_config: dict[str, Any],
    rng: random.Random,
) -> list[Location]:
    """Generate the complete synthetic geographic environment.

    Args:
        geography_config: Geography section of the config.
        rng: Seeded random number generator.

    Returns:
        List of Location objects with deterministic coordinates.
    """
    locations: list[Location] = []
    loc_counter = 0

    for metro_cfg in geography_config["metros"]:
        metro_name = metro_cfg["name"]
        center_lat = metro_cfg["center_lat"]
        center_lon = metro_cfg["center_lon"]
        count = metro_cfg["location_count"]

        for i in range(count):
            loc_counter += 1
            offset = _OFFSET_PATTERNS[i % len(_OFFSET_PATTERNS)]

            # Add small jitter for uniqueness within same offset pattern
            jitter_lat = rng.uniform(-0.003, 0.003)
            jitter_lon = rng.uniform(-0.003, 0.003)

            lat = center_lat + offset[0] + jitter_lat
            lon = center_lon + offset[1] + jitter_lon

            location_type = _LOCATION_TYPE_CYCLE[i % len(_LOCATION_TYPE_CYCLE)]
            region = _REGION_NAMES[i % len(_REGION_NAMES)]

            # Density and attractiveness vary by location type and metro
            base_density = rng.uniform(0.3, 0.9)
            if location_type in (LocationType.ATM, LocationType.BANK_BRANCH):
                base_attractiveness = rng.uniform(0.5, 0.95)
            elif location_type in (LocationType.SHOPPING_MALL, LocationType.MARKET):
                base_attractiveness = rng.uniform(0.4, 0.85)
            else:
                base_attractiveness = rng.uniform(0.1, 0.5)

            is_high_surveillance = location_type in (
                LocationType.BANK_BRANCH,
                LocationType.SHOPPING_MALL,
                LocationType.TRANSPORT_HUB,
            ) and rng.random() > 0.3

            locations.append(Location(
                location_id=f"LOC_{loc_counter:04d}",
                latitude=round(lat, 6),
                longitude=round(lon, 6),
                metro=metro_name,
                region=region,
                location_type=location_type,
                density_score=round(base_density, 3),
                cash_out_attractiveness=round(base_attractiveness, 3),
                is_high_surveillance=is_high_surveillance,
            ))

    return locations


def find_nearest_locations(
    lat: float,
    lon: float,
    locations: list[Location],
    k: int = 5,
) -> list[tuple[Location, float]]:
    """Find the k nearest locations to a given coordinate.

    Args:
        lat: Target latitude.
        lon: Target longitude.
        locations: List of all locations.
        k: Number of nearest locations to return.

    Returns:
        List of (location, distance_km) tuples sorted by distance.
    """
    distances = [(loc, _haversine_km(lat, lon, loc.latitude, loc.longitude)) for loc in locations]
    distances.sort(key=lambda x: x[1])
    return distances[:k]


def compute_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Public wrapper for haversine distance computation."""
    return _haversine_km(lat1, lon1, lat2, lon2)
