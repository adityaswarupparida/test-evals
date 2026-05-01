## Things I missed or couldn't achieve (and would build next)
- Fix Prompt caching - I tried everything but couldn't make it within the given deadline. Will definitely give a try after this with a fresh eye. Once done, the ~1,800-token system+tool prefix would cache from case 2 onwards, cutting per-run cost by roughly 60%.
- Add Sonnet 4.6 to the compare view to separate prompt strategy effects from model capability effects.

## Summary Table

|                      | zero_shot | few_shot | cot        |
|----------------------|-----------|----------|------------|
| Cases                | 50        | 48       | 50         |
| Mean agg F1          | 0.7866    | 0.7817   | **0.7894** |
| Schema failures      | 0         | 0        | 0          |
| Retries (2 attempts) | 0         | 7        | 0          |
| Tokens in            | 141,136   | 228,105  | 140,386    |
| Cost                 | $0.2466   | $0.3415  | $0.2459    | (= ~$0.8 < $1)
| Duration             | 109s      | 210s     | 115s       |

## Observations

**CoT wins overall but barely.** The aggregate F1 difference between CoT (0.7894) and zero_shot (0.7866) is 0.003 — within noise for most cases. CoT's real value shows up on the hardest transcripts: case_003 (0.655 vs 0.498 for zero_shot) and case_043 (0.806 vs 0.668). Both are cases where the clinical picture is ambiguous or partly implicit — the reasoning step helps the model work through what is and isn't stated before committing to an extraction.

**Medications extraction is strong across all three strategies** (med_f1 ~0.97 average). Forced tool use via `submit_extraction` with a strict input schema virtually eliminates free-form parsing errors. The few cases that score below 1.0 involve partial name fuzzy matches or frequency normalization edge cases, not model failures.

**Diagnoses is the consistent weak link** — roughly 12 cases per run score dx_f1=0.000 regardless of strategy. The hard cases are the same every run: transcripts where the physician implies a diagnosis through treatment choices rather than stating it explicitly, or where the gold annotation is more specific than what the transcript supports. No strategy fixes this — it is a fundamental ambiguity between the annotator's interpretation and the model's more literal extraction.

**few_shot underperforms despite having the most context.** It covered only 48 cases (2 reserved as examples), cost 38% more, took twice as long, and had 7 cases require a second attempt. The longer system prompt — embedding two full transcripts and gold JSONs — increases the chance of a malformed first-attempt tool call, triggering the retry loop. The examples help on some cases but the overhead is not justified at this API tier.

**case_042 hallucinates 3 values in every strategy.** Something in that transcript consistently leads the model to produce values with no textual grounding. It is the single best candidate for better annotation or a harder gold label.

## Why Each Strategy Wins on Which Fields

- **medications**: All strategies strong and roughly equal. CoT adds no benefit — values are explicit and structured.
- **vitals**: All strategies near-identical. Explicit numeric values are reliably extracted regardless of prompt style.
- **diagnoses**: CoT wins on ambiguous cases by reasoning through what is and isn't stated before committing. Zero_shot and few_shot more often miss implied diagnoses.
- **chief_complaint / plan / follow_up**: All strategies similar. These fields are typically stated directly in the transcript.

