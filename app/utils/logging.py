import logging
import uuid
from typing import Dict, Any

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
    logger.error("trace %s context=%s", trace_id, context, exc_info=exc)
    return trace_id
