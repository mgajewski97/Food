# Developer Notes

## Formatting & CI

Run `pre-commit install` to enable automatic formatting and linting. Data
files under `app/data/**/*.json` are excluded from formatters, but schemas and
translations are checked. Before committing, run `pre-commit run -a` to format
and lint the repository. CI uses `pre-commit/action` with `autofix_prs` to push
any formatting fixes.

## Uruchom serwer / Run server

From the project root run the development server with:

```
flask --app app:create_app run
```

## Data Models

### products.json

Array of objects:

- `name` (string)
- `unit` (string)
- `quantity` (number)
- `package_size` (number, default 1)
- `pack_size` (integer|null)
- `threshold` (number, default 1)
- `main` (boolean)
- `category` (string)
- `storage` (string)

### recipes.json

Array of objects:

- `name` (string)
- `portions` (integer)
- `time` (string, optional)
- `ingredients` (array of ingredient)
- `steps` (array of strings)
- `tags` (array of strings)

Ingredient can be either legacy `"product.key"` string or object:
`{ "product": "product.key", "quantity": number?, "unit": string? }`

## Validation Policy

Data files are validated against JSON Schemas in `app/schemas`. Invalid items
are logged as warnings and skipped; processing never aborts responses.
Use `/api/validate` to view counts and the first five warnings for each dataset.

## Running Validation

`curl http://localhost:5000/api/validate` when the server is running.

## Known Limitations / Next Steps

- Frontend layout still needs fine‑tuning for narrow screens.
- History view is minimal and lacks editing features.
- Validation only reports first five warnings per dataset.

## UI Labels (PL/EN)

- Uruchom serwer / Run server
- Aplikacja / Application
- Błąd / Error
- Start / Start
