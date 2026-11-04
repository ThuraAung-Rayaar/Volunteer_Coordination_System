"""
Transaction utilities for the Volunteer Coordination System.

The database-first architecture means most business logic lives in PostgreSQL
triggers and stored functions. Django services orchestrate these by:
1. Opening an atomic transaction (or joining an existing one)
2. Setting session context (app.user_id, app.ip)
3. Calling stored functions or performing ORM operations
4. Letting triggers enforce invariants

Key principles:
- Never commit mid-workflow; let the outermost atomic block control commit/rollback.
- Use savepoints (nested atomic) for partial rollback within a workflow.
- Always set session context at the start of a transaction.
- Stored function calls must happen inside the correct transaction.
"""

from __future__ import annotations

import functools
import logging
from contextlib import contextmanager
from typing import Any, Callable, Optional

from django.db import connection, transaction

from .db_context import set_db_session_context

logger = logging.getLogger(__name__)


@contextmanager
def service_transaction(
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    using: Optional[str] = None,
):
    """
    Context manager for service-layer operations requiring a transaction.

    Sets session context and provides an atomic transaction.
    Safe to nest: inner calls join the outer transaction via savepoints.

    Usage:
        with service_transaction(user_id=request.user.id, ip_address=client_ip):
            result = call_db_function(...)
    """
    with transaction.atomic(using=using):
        set_db_session_context(user_id=user_id, ip_address=ip_address)
        yield


def atomic_service(
    func: Optional[Callable] = None,
    *,
    using: Optional[str] = None,
):
    """
    Decorator that wraps a service function in an atomic transaction.

    Usage:
        @atomic_service
        def create_event(user, data):
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            with transaction.atomic(using=using):
                return fn(*args, **kwargs)
        return wrapper

    if func is not None:
        return decorator(func)
    return decorator


def call_db_function(
    sql: str,
    params: Optional[list] = None,
    fetch_one: bool = False,
    fetch_all: bool = False,
) -> Any:
    """
    Execute a SQL function call within the current transaction.

    This is the standard way to call PostgreSQL stored functions
    (e.g., verify_otp, geo_check_in, change_event_coordinator).

    Args:
        sql: SQL statement, e.g., "SELECT verify_otp(%s, %s, %s)"
        params: Parameters for the SQL statement.
        fetch_one: If True, return a single row.
        fetch_all: If True, return all rows.

    Returns:
        If fetch_one: single row tuple or None.
        If fetch_all: list of row tuples.
        Otherwise: None.
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        if fetch_one:
            return cursor.fetchone()
        elif fetch_all:
            return cursor.fetchall()
        return None


def call_db_function_returning(
    sql: str,
    params: Optional[list] = None,
) -> list[dict[str, Any]]:
    """
    Execute a SQL statement and return all result rows as dictionaries.

    Useful for functions returning TABLE or complex queries.

    Args:
        sql: SQL statement.
        params: Parameters.

    Returns:
        List of dictionaries with column names as keys.
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        columns = [col[0] for col in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]


@contextmanager
def savepoint(using: Optional[str] = None):
    """
    Create a savepoint for partial rollback within a larger transaction.

    Usage:
        with transaction.atomic():
            try:
                with savepoint():
                    risky_operation()
            except SomeError:
                pass
    """
    sid = transaction.savepoint(using=using)
    try:
        yield
        transaction.savepoint_commit(sid, using=using)
    except Exception:
        transaction.savepoint_rollback(sid, using=using)
        raise

