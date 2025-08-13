import uuid
from typing import Optional

from flask import jsonify


def error_response(message: str, status: int, trace_id: Optional[str] = None):
    payload = {"error": message}
    if status >= 500:
        payload["traceId"] = trace_id or uuid.uuid4().hex[:8]
    response = jsonify(payload)
    response.status_code = status
    return response
