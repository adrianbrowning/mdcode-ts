# Changing a command, flag or error code

The docs list commands, flags and error codes by hand in many places. `packages/mdcode/tests/docs.test.ts` goes red when a command or error code is missing from the places marked **(tested)**. Keep every other place in step yourself.

## A new command

- `COMMAND_NAMES` in `packages/mdcode/src/result.ts`. `CommandName` derives from it.
- Package README (`packages/mdcode/README.md`):
  - the Features list
  - a `## <Name> Command` section **(tested)**
  - `**<name>:**` flags under CLI Flags Reference
  - the envelope's `command` field under JSON Contract → Envelope
  - its envelope type under Schema, and a bullet under Results by Command (or a note that it has no `--json`)
  - its function under API Reference
  - a bullet under Changes from Earlier Versions
- Root `README.md`: a row in the Commands table **(tested)**.
- `examples/CLI_EXAMPLES.md`, when the command has examples worth showing.
- `CLAUDE.md`: one line under Commands Architecture.
- `TESTING.md`: the new test files.
- Exports in `packages/mdcode/src/index.ts`.

## A new error code

- `ERROR_CODES` in `packages/mdcode/src/result.ts`. `ErrorCode` derives from it.
- Package README:
  - a row in the JSON Contract → Errors table **(tested)**
  - the `ErrorCode` type under Schema, in the same order **(tested)**
  - every command section and API Reference entry that can return the code
  - Exit Codes, when the code changes an exit status
  - Changes from Earlier Versions, when the code replaces an older one

## A new or changed flag

- The command's `**<name>:**` list under CLI Flags Reference, and its command section.
- `examples/CLI_EXAMPLES.md`, when it shows that command.

## Every change

- A bumpy file: `pnpm bump`. Use `minor` for a new command, flag or code, and `major` once the JSON contract breaks.
- `pnpm check` before pushing; the pre-push hook runs it too.
