from datetime import datetime, timezone


def utc_now():
    """UTC stored without tzinfo to match the existing database DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
