from django.db import connection

def set_app_context(user_id: int = None, client_ip: str = None):
    """Sets app.user_id / app.ip via PostgreSQL SET LOCAL for row-level security / audit triggers."""
    with connection.cursor() as cursor:
        if user_id is not None:
            cursor.execute("SET LOCAL app.user_id = %s;", [str(user_id)])
        if client_ip is not None:
            cursor.execute("SET LOCAL app.ip = %s;", [client_ip])
