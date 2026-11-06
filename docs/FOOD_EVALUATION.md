# Food-photo Golden Dataset evaluation (v1)

The pure offline evaluator is in `src/modules/food/food-evaluation.ts` with synthetic unit tests in `food-evaluation.spec.ts`. The initial versioned manifest `test/fixtures/food-golden/v1.json` is intentionally **empty**: there are no independently verified real-food labels in the repository.

## Collect trustworthy labels

- Obtain permission before storing a user's food photo or correction. Remove identifying metadata and keep raw photos in access-controlled test storage, not public Git.
- For each case, assign a stable anonymized ID, expected image class (`food`, `menu`, `workout`, `other`, or `uncertain`), and an approved fixture location.
- Add weighed edible grams and independently sourced/verified nutrition reference values only when measured or reliable. Omit fields whose ground truth is unknown; do not present AI estimates as ground truth.
- Include Thai meals, mixed plates, portion variations, packaged labels, restaurant menus, multiple food items, low-quality photos and non-food images.
- Version both labeled cases and model/prompt configuration. Keep training and evaluation examples separate.

## Reproducible evaluation procedure

1. Freeze the dataset revision and model/prompt version. Never run evaluations against Production records or secrets.
2. Run the photo pipeline in a disposable, cost-controlled environment; collect anonymized predictions, success/error states, latency, and costs.
3. Match predictions to reference cases by ID and pass them into `evaluateFoodGoldenDataset`.
4. Record classification accuracy, edible-weight MAE, calorie and macro MAE, invalid-output rate, user-correction rate, P50/P95 latency and cost per successful analysis.
5. Report denominators and missing labels. An unavailable metric is **null**, not zero; missing predictions must also be reported.
6. Compare against a frozen baseline and inspect regression examples before adopting a model/prompt change.

The initial evaluator only computes metrics; an image-runner, verified labels, and privacy review are still required before claims about real-world AI accuracy can be made.
