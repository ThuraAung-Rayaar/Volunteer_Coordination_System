import math

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate geodesic distance between two points in meters using Haversine formula."""
    r = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c

def is_within_geofence(lat: float, lon: float, fence_lat: float, fence_lon: float, radius_meters: float) -> bool:
    return haversine_distance(lat, lon, fence_lat, fence_lon) <= radius_meters
