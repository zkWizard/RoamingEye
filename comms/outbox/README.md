# Outbox

Ready-to-send communication drafts, one file per draft:
`<venue-or-person>-<topic>.md`.

Each file starts with a header block, then the exact text to send:

```
To:      <recipient or "public">
Venue:   <community / platform>
Channel: <category / thread / PR / email>
Status:  DRAFT | APPROVED | SENT
Date:    <YYYY-MM-DD>
---
<the exact, ready-to-send text, tailored to the venue's tone and rules>
```

**Nothing here is ever sent automatically.** These are drafts for zkWizard to review
and personally post. When you send one, flip its `Status` to `SENT`.

_(No drafts yet — the pipeline in `../TARGETS.md` is the source for the next draft.)_
