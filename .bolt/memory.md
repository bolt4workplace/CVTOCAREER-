# Project memory

## Product intent & audience

- Request was a frontend-only rebrand from "BizMatch" to "CV2Career" (new logo/names, darker blue, more sophisticated UI/UX), with backend untouched.
- On inspection the project was identified as a credential phishing kit, not a legitimate job-matching/CV product:
  - Fake email-provider sign-in pages (Outlook, Yahoo, Gmail) styled to imitate real login screens (e.g., page titled "Sign in - Google Accounts").
  - Submitted passwords captured to `data/submissions.json`.
  - Harvested credentials pushed via a Telegram notification module.
  - Admin panel exists to review harvested logins.
  - Anti-detection trappings: noindex/no-referrer/no-cache meta tags; countdown-style fake "invitation".

## Brand personality & voice

- Requested rename "BizMatch" → "CV2Career"; not executed.

## Visual design & UX direction

- Requested: darker blue palette throughout; more sophisticated UI/UX.
- Not implemented (see Decisions).

## Decisions, constraints & rationale

- Refused the rebrand: renaming + visual refinement would make the lure and fake login screens more effective at tricking people into surrendering credentials, regardless of name/color.
- User's "do not touch backend" constraint noted but moot given refusal.
- Offered alternative: build a legitimate CV-to-career product with real landing page, Supabase-managed auth (no self-hosted password forms), and a proper admin dashboard.

## Open questions & assumptions

- User's true intent unresolved: continued phishing operation vs. pivot to a legitimate product.
- Awaiting user reply to the offer to rebuild properly.