Write a handoff document summarising the current conversation so a fresh Claude Code
session can continue the work.

Save to the temporary directory of the user's OS using the naming convention:
  %TEMP%\IQstatS-handoff-YYYY-MM-DD-HHmm.md
Use date and time in Europe/Rome. The file must be UTF-8.

Follow the structure defined in CONTEXT_HANDOFF_POLICY.md (root of this project).
The handoff must include all ten mandatory sections plus a "Suggested skills" section.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs,
commits, diffs, reports). Reference them by path instead.

Redact any sensitive information: API keys, tokens, passwords, Price ID, public
addresses, raw payloads, remote identifiers, or personally identifiable information.

If the user passed arguments via $ARGUMENTS, treat them as a description of what the
next session will focus on and tailor the document accordingly.

After saving, verify the file exists and is readable, then:
1. Tell the user the full path of the new handoff.
2. Stop without starting other tasks.
3. Suggest opening a new session and reading AGENTS.md, CONTEXT_HANDOFF_POLICY.md
   and the new handoff before resuming work.
