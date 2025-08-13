"""Application factory and global error handling."""

from flask import Flask, request
from werkzeug.exceptions import HTTPException

from .errors import error_response
from .utils.logging import log_error_with_trace


def create_app() -> Flask:
    """Application factory for the Food project."""
    app = Flask(__name__, static_folder="static", template_folder="templates")

    from .routes import bp, run_initial_validation

    app.register_blueprint(bp)
    run_initial_validation()

    @app.errorhandler(404)
    def handle_404(error):
        return error_response("not found", 404)

    @app.errorhandler(HTTPException)
    def handle_http(error: HTTPException):
        return error_response(error.description, error.code)

    @app.errorhandler(Exception)
    def handle_exception(error: Exception):
        trace_id = log_error_with_trace(
            error, {"path": request.path, "args": request.args.to_dict()}
        )
        return error_response("Internal Server Error", 500, trace_id)

    return app
