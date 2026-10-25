# Editable Routines And Final Visual Appendix

This is an additive update to Consulta, not a routine migration or a client portal.
There are no new tables, storage keys, profile IDs, source-plan rewrites or startup
seeds. Existing assignments keep their own routine copies and exercise IDs.

## Reading and editing

- `routine-support.js` derives a prescription from the assignment copy, its
  `planByMicro`, and the optional patch at
  `iteration.sesiones[micro][day].ejs[exercise].prescripcion`.
- A patch contains only changed exercise properties and changed `plan` fields.
  Unknown fields, source cells, results and comments remain intact. Removing a
  patch does not remove results. Substitution is blocked after recording results.
- The original editable matrix remains the only primary routine view: all
  microcycles in columns, Kg/Reps for each set, rest and comments. No new
  single-microcycle card workflow replaces it. The pencil in each column edits
  the current client, iteration, microcycle, day and slot.
- Exercise photos and explanations are a final appendix, after the complete
  training register and charts, never interleaved with result fields.
- Template editing is separate. Existing template text is read-only; changing a
  header cannot parse and replace its entire exercise tree. Its exercise editor
  changes only the selected microcycle's plan, preserving other plans/metadata.
- General technique, trainer instructions, target load and performed results are
  separate. Numeric guards still reject units and comments in Kg/Reps.
- History, charts, PRs and Excel distinguish substituted movement names. Circuit
  results include every recorded round, not only the first component occurrence.

## Library and images

`exercise-library.js` contains 12 reviewed movements and conservative aliases.
The 24 local JPEGs are extracted photo regions from the trainer-supplied visual
reference, not whole pages containing client information. Total size: 714,277
bytes. No external image service or per-client image copy is used.

Ambiguous alternatives such as rowing/seal-row and pull-ups/lat-machine are not
silently identified as one movement. The final appendix can show the specific
alternative pictured in the supplied reference, explicitly labeled as an
illustrated alternative; this does not associate, rename or store a movement.
The trainer may explicitly associate a
variant and opt to reuse that mapping in the optional `exerciseAliases` property
inside `tob_online_v2`. Unmatched names remain visible without invented images.
Future catalog additions need reviewed images, variants and provenance.

## Dates and PDFs

The UI shows DD/MM; saved dates remain full ISO dates. Full dates keep their year.
Short dates use the iteration's period and neighboring sessions within an
anchored window. Missing/ambiguous years and impossible dates are rejected rather
than guessed. New assignment/iteration starts use the local calendar date.

`routine-pdf.js` preserves the supplied reference's cover, black exercise headers,
compact microcycle columns and editable Kg/Reps cells. Photos and explanations
are appended after every training day. Exercise blocks stay together where they
fit; long blocks continue under a repeated exercise header. Existing field names remain compatible; subject metadata identifies
client, assignment, iteration, period and movement identity. Private assignment
notes are not exported. Import validates the entire document in a staged copy
before applying anything and asks before replacing filled values. Legacy PDFs
without metadata require explicit destination confirmation; unidentifiable or
non-form PDFs are not repaired or imported automatically.

## Storage and recovery

The existing `tob_online_v2` facade, IndexedDB checkpoints, central D1 CAS/version
history and session permissions remain unchanged. Only explicit trainer edits
add optional fields. There is no bulk conversion of existing routines.

Private verified pre-change backups are outside this Git repository at
`../.full-training-backups/20261024-routines/`: complete business SQL, auth SQL,
selected source files and a compatibility-test copy. Both SQL files were restored
in an in-memory SQLite database; integrity and foreign-key checks passed.

Do not restore a whole old database over current edits. Inspect versions and
preserve current records first. After optional patches have been saved, rollback
must retain `routine-support.js` and compatible readers for those patches;
blindly reverting to a pre-update UI could hide them. No automatic data rollback
or cleanup is included in this release.

## Verification

- Actual backup: 16 templates and 15 assignments load with every field and ID
  unchanged, without migration or network access.
- Unit tests cover matching, dates, scoped patches, permissions and snapshot
  round trips; a patch changes the iteration record plus shared alias root only.
- Isolated browser tests cover desktop/mobile, original source-plan preservation,
  editing isolation, dirty-form guards, numeric validation, movement-separated
  charts, invalid imports and wrong-iteration rejection.
- All 16 BIIO source variants generate PDFs with unique editable fields and
  their final microcycle present, without changing the source.
- The synthetic reference PDF has 528 canonical fields and 528 corresponding
  widgets. Values, appearances, page bounds and exclusion of private notes were
  checked after reopening with pypdf and pages were visually rendered.

Synthetic QA output and PDFs are outside Git. Production user authentication is
still governed by Cloudflare Access; isolated tests do not replace checking a
real authenticated session after publication.
