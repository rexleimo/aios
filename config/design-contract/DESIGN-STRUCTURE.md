<!--
  DESIGN.md — the shared structure.

  This file is the owner of what a design contract must say, not of what any
  project says. It contains no palette, no font, no product name, so it can be
  shipped to any project; the generator fills the sections from measurement and
  leaves the choices open.

  Why a structure at all: the sections are the questions. A design document that
  skips "Assumptions" hides which decisions were guesses, and one that skips
  "Evidence Snapshot" cannot be checked against the code it describes. Both
  omissions read as confidence, which is the failure mode.

  Editing rules: a section may be added here when it corresponds to a question
  every project has to answer. A section that only one product needs belongs in
  that product's instance as 决策记录, not here.

  This file is the *reader's guide*, not the enforcement. The enforced list is
  REQUIRED_DESIGN_SECTIONS in scripts/lib/design-contract/rules.mjs, and
  scripts/tests/foundation/standards/design-contract.test.mjs asserts that the
  bolded headings below and that list are the same set. Three copies of "which
  sections exist" already existed once in this repository and diverged; the test
  is what keeps this one honest instead of aspirational.
-->

# What a design contract must answer

**Mode** — is this a restyle of a working interface, or a reference to a known
product's language? Name which, because the two have different freedom: a
restyle may not change information architecture, a reference may not invent.

**Evidence Snapshot** — the facts the contract stands on, each traceable to
something in the repository: declared tokens, theme blocks, font stacks, the
count of colours that bypass the tokens. Not adjectives. "Restrained neutral
grey with a single accent" is not evidence; "194 tokens, 3 theme blocks, 92 hex
literals outside the token sources" is.

**Assumptions** — the decisions made without a user instruction, named as
assumptions rather than presented as requirements. Goal, primary user, platform,
scope. A wrong assumption written down is a correction; a wrong assumption
absorbed into the "visual system" is a rewrite.

**Visual System** — what the product actually uses, grouped by role: surfaces,
text, accents, elevation, spacing, radii, type. Each entry traces to a token
name or to a measured value. Where the product has no token for a role, say so;
a gap named is a task, a gap concealed is drift.

**Accessibility Baseline** — contrast, focus visibility, motion preference,
text scaling. Stated as commitments a reviewer can test, not as intentions.

**决策记录** — the choices the measured evidence does not settle: which accent
carries meaning, which surfaces may use placeholder content, which trees are out
of scope and on what grounds. Each entry takes the form *decision + reason + the
option rejected*. This is the only section a person writes freely.

## What must not appear

- **Another product's identity** presented as this one's. A reference may name
  what it borrows; it may not adopt a name, a logo or a trademark as its own.
- **Rules the project does not follow.** If the measured evidence contradicts a
  stated rule, the contradiction is the finding — record it in 决策记录 and fix
  it, or drop the rule. A rule stated and contradicted trains readers to ignore
  the document.
- **Unanswered placeholders.** `TODO(decision)` is correct in a freshly generated
  file and wrong in a committed one.
