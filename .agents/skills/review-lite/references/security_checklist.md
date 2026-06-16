# Security Checklist

Check each item against the in-scope code. Report any match as a finding.

## Input Handling

- [ ] User input passed to shell commands without sanitization (command injection)
- [ ] User input interpolated into SQL/NoSQL queries without parameterization (injection)
- [ ] File paths constructed from user input without path traversal checks (`../` attacks)
- [ ] User input used in `eval()`, `Function()`, `new Function()`, `exec()`, or template literals executed as code
- [ ] User input rendered as HTML without escaping (XSS)
- [ ] User input used to construct URLs without validation (SSRF, open redirect)
- [ ] Deserialization of untrusted data (pickle, yaml.load, JSON.parse of user-controlled schemas)

## Secrets and Credentials

- [ ] Secrets, API keys, tokens, or credentials hardcoded in source code
- [ ] Secrets logged to stdout, stderr, or log files
- [ ] `.env` files committed to version control
- [ ] Secrets passed as URL query parameters (visible in logs and browser history)
- [ ] Default or weak credentials shipped in config files

## Authentication and Authorization

- [ ] Missing or incorrect permission checks on routes, endpoints, or API methods
- [ ] Auth bypass via parameter manipulation, header injection, or token reuse
- [ ] Session tokens without expiration, rotation, or secure flag
- [ ] Password comparison using `==` instead of constant-time comparison
- [ ] Missing rate limiting on authentication endpoints

## Network and HTTP

- [ ] HTTP responses missing security headers (CORS, CSP, X-Frame-Options, X-Content-Type-Options)
- [ ] CORS configured with `*` or overly permissive origins
- [ ] HTTPS not enforced; mixed content allowed
- [ ] Sensitive data sent over unencrypted connections
- [ ] WebSocket connections without origin validation

## Dependencies

- [ ] Dependencies with known CVEs (check lockfile age and advisory databases)
- [ ] Pinned dependencies using exact versions that are known-vulnerable
- [ ] Unused dependencies that expand the attack surface
- [ ] Dependencies loaded from untrusted registries or URLs

## File and Resource Handling

- [ ] File uploads without type, size, or content validation
- [ ] Temporary files created with predictable names (symlink attacks)
- [ ] File permissions set too broadly (world-readable secrets)
- [ ] Resource handles (file descriptors, DB connections) not closed in error paths

## Error Handling

- [ ] Error messages that leak stack traces, internal paths, or database schema
- [ ] Catch blocks that silently swallow errors without logging
- [ ] Generic error handlers that mask security-relevant failures
