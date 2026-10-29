# apps/common/fields.py
import json
from django.contrib.postgres.fields import ArrayField


class ChoiceArrayField(ArrayField):
    """
    Dual-backend ArrayField:
    - On PostgreSQL: Uses native PostgreSQL arrays (text[], varchar[]), fully compatible with PostgreSQL schema.
    - On SQLite (fallback/sandboxed tests): Stores as serialized JSON text.
    """
    def __init__(self, base_field, **kwargs):
        kwargs.setdefault("default", list)
        kwargs.setdefault("blank", True)
        super().__init__(base_field, **kwargs)

    def db_type(self, connection):
        if connection.vendor != "postgresql":
            return "text"
        return super().db_type(connection)

    def get_db_prep_value(self, value, connection, prepared=False):
        if connection.vendor != "postgresql":
            if value is None:
                return value
            return json.dumps(value)
        return super().get_db_prep_value(value, connection, prepared=prepared)

    def to_python(self, value):
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
        return super().to_python(value)

    def from_db_value(self, value, expression, connection):
        if connection.vendor != "postgresql":
            if value is None:
                return value
            if isinstance(value, str):
                try:
                    return json.loads(value)
                except Exception:
                    return []
            return value
        return value

    def get_db_converters(self, connection):
        converters = super().get_db_converters(connection)
        if connection.vendor != "postgresql":
            converters.append(self.from_db_value)
        return converters
