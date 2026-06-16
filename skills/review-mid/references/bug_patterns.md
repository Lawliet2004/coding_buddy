# Bug Patterns

Check each pattern against the in-scope code. Report any match as a finding.

## Logic Errors

- [ ] Off-by-one errors in loops, slicing, or array indexing
- [ ] Wrong comparison operator (`=` vs `==` vs `===`, `<` vs `<=`)
- [ ] Inverted boolean logic (negation errors, wrong De Morgan application)
- [ ] Short-circuit evaluation hiding side effects
- [ ] Switch/case fallthrough without explicit intent

## Null and Undefined Handling

- [ ] Accessing properties on potentially null/undefined values without checks
- [ ] Functions that return null in some paths but callers don't check
- [ ] Optional chaining (`?.`) masking bugs by silently producing undefined
- [ ] Default parameter values that hide missing required arguments

## Async and Concurrency

- [ ] Unhandled promise rejections (missing `.catch()` or `try/catch` around `await`)
- [ ] Race conditions from shared mutable state accessed by concurrent operations
- [ ] `await` missing on async function calls (fire-and-forget bugs)
- [ ] Callback-based code mixed with promises without proper bridging
- [ ] Deadlocks from circular async dependencies or mutex misuse

## Type and Coercion

- [ ] Implicit type coercion producing unexpected results (`==` in JS, `+` with mixed types)
- [ ] String-to-number conversion without validation (NaN propagation)
- [ ] Integer overflow or underflow in languages without bounds checking
- [ ] Floating-point comparison with `==` instead of epsilon-based comparison

## Error Handling

- [ ] Catch blocks that swallow errors silently (empty catch, catch-and-ignore)
- [ ] Error objects discarded — caught but not logged, rethrown, or handled
- [ ] Finally blocks that mask exceptions from the try block
- [ ] Error handling that doesn't clean up resources (file handles, connections, locks)

## Data and State

- [ ] Mutable state shared between unrelated components
- [ ] Stale closures capturing variables that change after capture
- [ ] Cache invalidation missing or incorrect
- [ ] Data structures modified during iteration (ConcurrentModificationException pattern)
- [ ] Deep copy needed but shallow copy used (shared nested references)

## API and Contract

- [ ] Function called with wrong argument order (especially positional args of same type)
- [ ] API response shape assumed without validation
- [ ] Return value ignored when it signals success/failure
- [ ] Inconsistent error return conventions within the same module
