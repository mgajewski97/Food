"""Application factory and global error handling."""

import json
import logging
import os
from datetime import datetime

from flask import Flask, g, request
from werkzeug.exceptions import HTTPException

from .errors import DomainError, error_response
from .utils.logging import log_error_with_trace, log_warning_with_trace


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:  # pragma: no cover - simple
        data = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat(),
            "level": record.levelname,
        }
        if isinstance(record.msg, dict):
            data.update(record.msg)
        else:
            data["message"] = record.getMessage()
        if record.exc_info:
            data["stack"] = self.formatException(record.exc_info)
        return json.dumps(data)


def create_app() -> Flask:
    """Application factory for the Food project."""
    app = Flask(__name__, static_folder="static", template_folder="templates")

    if os.environ.get("APP_JSON_LOGS") == "1":
        log_dir = os.path.join(os.path.dirname(__file__), "..", "logs")
        os.makedirs(log_dir, exist_ok=True)
        handler = logging.FileHandler(os.path.join(log_dir, "app.log"))
        handler.setFormatter(JSONFormatter())
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)
        root_logger.handlers = [handler]

        @app.after_request
        def _log_request(response):
            record = {
                "method": request.method,
                "path": request.path,
                "status": response.status_code,
            }
            trace_id = getattr(g, "trace_id", None)
            if trace_id:
                record["traceId"] = trace_id
            root_logger.info(record)
            return response
    else:  # pragma: no cover - no-op configuration
        logging.getLogger().addHandler(logging.NullHandler())

    from .routes import bp, run_initial_validation

    app.register_blueprint(bp)
    run_initial_validation()

    @app.errorhandler(404)
    def handle_404(error):
        return error_response("not found", 404)

    @app.errorhandler(DomainError)
    def handle_domain(error: DomainError):
        trace_id = log_warning_with_trace(
            str(error), {"path": request.path, "args": request.args.to_dict()}
        )
        g.trace_id = trace_id
        return error_response(str(error), 400, trace_id)

    @app.errorhandler(HTTPException)
    def handle_http(error: HTTPException):
        return error_response(error.description, error.code)

    @app.errorhandler(Exception)
    def handle_exception(error: Exception):
        trace_id = log_error_with_trace(
            error, {"path": request.path, "args": request.args.to_dict()}
        )
        g.trace_id = trace_id
        return error_response("Internal Server Error", 500, trace_id)

    return app
