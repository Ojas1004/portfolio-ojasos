"""MongoDB access.

The client is created lazily and cached at module level, so warm serverless
invocations reuse the same connection pool instead of reconnecting.

Configuration (environment variables):
  MONGODB_URI     Atlas connection string (mongodb+srv://...). Required in production.
  MONGODB_DB      database name (default "ojasos").
  OJASOS_MOCK_DB  set to 1 for local development without MongoDB; uses an
                  in-memory mongomock database (pip install mongomock). Data is
                  lost on restart, so never use it in production.
"""

import logging
import os
import threading

from pymongo import ASCENDING, DESCENDING, MongoClient, monitoring
from pymongo.errors import PyMongoError

log = logging.getLogger(__name__)


class QueryTimer(monitoring.CommandListener):
    """Adds up MongoDB command time for the current request.

    PyMongo publishes command events on the thread that ran the command, so a
    thread-local total is per request. app.py resets it when a request starts
    and reports it in the Server-Timing response header.
    """

    def __init__(self):
        self._local = threading.local()

    def reset(self):
        self._local.count, self._local.micros = 0, 0

    def read(self):
        """(number of commands, total milliseconds) since the last reset."""
        return getattr(self._local, "count", 0), getattr(self._local, "micros", 0) / 1000

    def _add(self, event):
        self._local.count = getattr(self._local, "count", 0) + 1
        self._local.micros = getattr(self._local, "micros", 0) + event.duration_micros

    def started(self, event):
        pass

    def succeeded(self, event):
        self._add(event)

    def failed(self, event):
        self._add(event)


query_timer = QueryTimer()

_db = None
_indexes_ready = False


def get_db():
    """Return the database handle, or None if no database is configured."""
    global _db
    if _db is not None:
        return _db

    uri = os.environ.get("MONGODB_URI", "").strip()
    name = os.environ.get("MONGODB_DB", "ojasos")
    if uri:
        client = MongoClient(
            uri,
            appname="ojasos",
            serverSelectionTimeoutMS=4000,
            connectTimeoutMS=4000,
            socketTimeoutMS=8000,
            maxPoolSize=5,  # serverless: few concurrent requests per instance
            retryWrites=True,
            event_listeners=[query_timer],
        )
        _db = client[name]
    elif os.environ.get("OJASOS_MOCK_DB") == "1":
        import mongomock  # dev-only dependency

        log.warning("Using in-memory mongomock database (OJASOS_MOCK_DB=1). Data will not persist.")
        _db = mongomock.MongoClient()[name]
    else:
        return None

    ensure_indexes(_db)
    return _db


def set_db(db):
    """Override the database (used by tests)."""
    global _db, _indexes_ready
    _db = db
    _indexes_ready = False
    if db is not None:
        ensure_indexes(db)


def ensure_indexes(db):
    """Create indexes once per process. create_index is idempotent."""
    global _indexes_ready
    if _indexes_ready:
        return
    try:
        db.commands.create_index([("timestamp", DESCENDING)])
        db.messages.create_index([("created_at", DESCENDING)])
        # TTL index: MongoDB deletes rate-limit buckets automatically once expired.
        db.rate_limits.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
        _indexes_ready = True
    except PyMongoError as exc:  # don't take the site down if Atlas is slow
        log.warning("Could not ensure indexes: %s", exc)
