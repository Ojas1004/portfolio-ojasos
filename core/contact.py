"""Contact form validation and per-IP rate limiting (stored in MongoDB)."""

import hashlib
import os
import re
import time
from datetime import datetime, timezone

from pymongo import ReturnDocument

EMAIL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$")
FIELDS = {
    # field: (min length, max length, label)
    "name": (2, 80, "Name"),
    "email": (6, 254, "Email"),
    "message": (10, 2000, "Message"),
}


def validate_contact(body):
    """Return (clean_data, errors). errors maps field -> message."""
    clean, errors = {}, {}
    for field, (lo, hi, label) in FIELDS.items():
        raw = body.get(field, "")
        if not isinstance(raw, str):
            errors[field] = f"{label} must be text."
            continue
        value = raw.strip()
        if field != "message":
            value = " ".join(value.split())  # collapse whitespace / newlines
        if not value:
            errors[field] = f"{label} is required."
        elif len(value) < lo:
            errors[field] = f"{label} must be at least {lo} characters."
        elif len(value) > hi:
            errors[field] = f"{label} must be at most {hi} characters."
        clean[field] = value

    if "email" not in errors and not EMAIL_RE.match(clean["email"]):
        errors["email"] = "Please enter a valid email address."
    return clean, errors


def hash_ip(ip):
    """We never store raw IPs: only a salted hash, used for rate limiting."""
    salt = os.environ.get("IP_HASH_SALT", "ojasos")
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()[:24]


def rate_limit(db, key, limit, window_seconds):
    """Fixed-window counter in MongoDB.

    Each (key, window) gets one document whose ``count`` is atomically
    incremented. A TTL index on ``expires_at`` makes MongoDB delete old
    windows automatically, so nothing is kept in process memory (which would
    not survive between serverless invocations anyway).

    Returns (allowed: bool, retry_after_seconds: int).
    """
    now = time.time()
    window = int(now // window_seconds)
    window_end = (window + 1) * window_seconds
    doc = db.rate_limits.find_one_and_update(
        {"_id": f"{key}:{window}"},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": datetime.fromtimestamp(window_end, timezone.utc)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return doc["count"] <= limit, max(1, int(window_end - now))
