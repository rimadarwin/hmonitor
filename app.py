"""
Shim per host che avviano `gunicorn app:app` (default Render).
L'app WSGI reale è definita in update_dates_api_server.
"""
from update_dates_api_server import app  # noqa: F401
