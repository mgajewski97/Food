import logging
import uuid
from typing import Any, Dict

logger = logging.getLogger(__name__)


def log_error_with_trace(exc: Exception, context: Dict[str, Any]) -> str:
    """Log an exception with a short trace identifier.

    Args:
        exc: The exception instance.
        context: Additional context such as endpoint and request args.

    Returns:
        str: Generated trace identifier (first 8 chars of UUID4).
    """
    trace_id = uuid.uuid4().hex[:8]
    logger.error({"error": str(exc), "context": context, "traceId": trace_id}, exc_info=exc)
    return trace_id


def log_warning_with_trace(message: str, context: Dict[str, Any]) -> str:
    """Log a warning with a short trace identifier.

    Args:
        message: Warning message to log.
        context: Additional context such as endpoint and request args.

    Returns:
        str: Generated trace identifier (first 8 chars of UUID4).
    """
    trace_id = uuid.uuid4().hex[:8]
    logger.warning({"message": message, "context": context, "traceId": trace_id})
    return trace_id
