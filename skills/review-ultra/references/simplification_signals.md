# Simplification Signals

Check each signal against the in-scope code. Candidates that match multiple signals are higher priority for simplification.

## Abstractions Without Payoff

- [ ] Interface or abstract class with exactly one implementation
- [ ] Factory function that always returns the same type
- [ ] Strategy pattern with only one strategy
- [ ] Adapter or wrapper that passes through all calls without transformation
- [ ] Generic type parameter that is always the same concrete type
- [ ] Plugin system with exactly one plugin

## Unnecessary Indirection

- [ ] Function that only calls one other function with the same arguments
- [ ] Module that re-exports everything from another module without adding value
- [ ] Configuration layer that wraps a simple value (config.get('port') vs PORT)
- [ ] Event system used for what should be a direct function call
- [ ] Dependency injection where the dependency never varies

## Over-Structured Code

- [ ] Class with only static methods (should be plain functions)
- [ ] Class with one method besides the constructor (should be a function)
- [ ] Builder pattern for objects with ≤3 fields
- [ ] Separate model/DTO/entity layers that are structurally identical
- [ ] Utility classes that should be standalone functions

## Bloated Error Handling

- [ ] Try/catch that wraps a single line that cannot throw
- [ ] Custom error classes that add no information beyond the message
- [ ] Error transformation chains that re-wrap errors without adding context
- [ ] Defensive null checks where the value is guaranteed non-null by contract

## Dead and Unused Code

- [ ] Exported functions with no importers
- [ ] Feature flags that are always on or always off
- [ ] Commented-out code blocks (should be deleted; git has history)
- [ ] TODO/FIXME comments older than 6 months with no associated tracking
- [ ] Test utilities that are never called from test files
