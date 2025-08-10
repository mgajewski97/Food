from flask import Flask


def create_app() -> Flask:
    """Application factory for the Food project."""
    app = Flask(__name__, static_folder="static", template_folder="templates")

    from .routes import bp, run_initial_validation

    app.register_blueprint(bp)
    run_initial_validation()

    return app

