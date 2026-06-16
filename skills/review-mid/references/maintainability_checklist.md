# Maintainability Checklist

Check each item against the in-scope code. Report any match as a finding.

## Complexity

- [ ] Functions longer than ~50 lines that do multiple unrelated things
- [ ] Cyclomatic complexity: more than 3 levels of nesting (if/else/loop/try)
- [ ] God objects: classes or modules with too many responsibilities
- [ ] Long parameter lists (>4 params) that should be an options object or struct
- [ ] Complex conditionals that should be extracted into named boolean functions

## Duplication

- [ ] Copy-pasted logic across multiple files or functions (>5 similar lines)
- [ ] Multiple functions that differ only in one small detail (extract + parameterize)
- [ ] Repeated error handling patterns that should be a shared utility
- [ ] Config or constants duplicated across files instead of centralized

## Naming and Contracts

- [ ] Variable or function names that don't describe their purpose
- [ ] Boolean parameters that make call sites unreadable (`doThing(true, false, true)`)
- [ ] Functions whose behavior contradicts their name
- [ ] Inconsistent naming conventions within the same module
- [ ] Public APIs without documentation of expected inputs, outputs, and error conditions

## Structure

- [ ] Circular dependencies between modules
- [ ] Import chains deeper than 3 levels to reach a utility
- [ ] God files: single files with >500 LOC containing unrelated functionality
- [ ] Test files that test implementation details instead of behavior
- [ ] Dead imports or requires

## Change Risk

- [ ] Code where a small change would require updating many files (high coupling)
- [ ] Implicit dependencies: code that only works because of file execution order or global state
- [ ] Magic numbers or strings without named constants
- [ ] Hardcoded environment assumptions (paths, URLs, ports) that should be config
