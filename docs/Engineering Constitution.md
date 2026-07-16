Prosto — Engineering Constitution
Core Philosophy

Prosto is a long-term social platform designed for continuous evolution.

Every decision must prioritize long-term maintainability over short-term convenience.

Architecture is a permanent investment.

Features are temporary.

Good architecture allows features to evolve without rewriting the system.

Poor architecture eventually destroys development velocity.

Always think about how today's implementation will behave after several years of development.

Every line of code becomes future technical debt.

Write code that another experienced engineer can immediately understand.

The project should read like a well-written book, not like generated code.

Project Priorities

Always follow this priority order:

Security
Correctness
Architecture
Maintainability
Scalability
Performance
User Experience
New Features

Never sacrifice a higher priority for a lower one.

General Rules

Never guess.

Never assume.

Never invent functionality.

Never generate code without understanding existing architecture.

Always inspect existing modules before creating new ones.

Every new file must have a reason to exist.

Every new abstraction must solve a real problem.

Every piece of code must justify its complexity.

If a simpler solution exists with identical maintainability, always choose the simpler one.

Engineering Mindset

Treat every implementation as production-ready.

Assume:

millions of users
thousands of concurrent requests
years of maintenance
multiple future developers

Never write temporary-looking code.

Never write "we will fix later" code.

Future refactoring is expensive.

Write it correctly the first time.

Context Awareness

Before changing anything:

Always understand:

current architecture
feature boundaries
existing abstractions
reusable components
shared utilities
naming conventions
coding style

Never implement code in isolation.

Every modification must naturally fit into the existing project.

The codebase should feel like one person wrote everything.

Simplicity

Complexity is a bug.

Always prefer:

fewer files
fewer abstractions
fewer dependencies
fewer states
fewer special cases

Avoid clever code.

Prefer obvious code.

Readable code is always better than impressive code.

Architecture

Every feature must be isolated.

Example:

features/
    auth/
    feed/
    profile/
    search/
    messages/
    settings/

Features never directly depend on each other.

Shared logic belongs inside shared modules.

Business logic never belongs inside UI components.

UI components should remain as dumb as possible.

Reusability

Before creating:

component
hook
utility
service
helper
type
schema

Always search for an existing implementation.

Never duplicate functionality.

One reusable implementation is always preferred.

Code Quality

Forbidden:

duplicated logic
dead code
commented-out code
unused imports
unused variables
magic numbers
magic strings
hidden side effects
deeply nested conditions
giant functions
giant components
copy-paste programming

Prefer:

small functions
descriptive names
explicit logic
predictable behavior
early returns
Error Handling

Never silently ignore errors.

Every possible failure must be handled.

Every external request must have:

timeout
retry strategy (when appropriate)
validation
proper error reporting

Never expose internal errors to users.

Never expose stack traces.

Never leak implementation details.

Security (Highest Priority)

Security is mandatory.

Never trade security for convenience.

Assume every input is malicious.

Validate everything.

Trust nothing.

Authentication

Passwords must never be stored in plain text.

Passwords must be hashed using:

Argon2id

Requirements:

unique random salt
secure parameters
constant-time verification

Never use:

SHA
MD5
bcrypt for new implementations
MFA

Support Multi-Factor Authentication.

Design authentication so MFA can be enabled without architectural changes.

Sessions

Authentication is JWT-based.

Requirements:

Access Token:

lifetime: 15 minutes

Refresh Token:

securely stored
revocable
rotated after refresh
individually identifiable

Support session invalidation.

Support logout from all devices.

Authorization

Never trust the client.

Every permission must be verified on the server.

Hidden UI is not security.

Secrets

Never hardcode:

API keys
secrets
passwords
tokens
credentials
encryption keys

All secrets belong inside:

.env

Never expose secrets to the client.

Environment Variables

Environment variables must be validated during startup.

Application must fail immediately if required variables are missing.

Input Validation

Validate every request.

Validate:

body
query
params
headers

Never trust client-side validation.

Database Security

Always use parameterized queries.

Never concatenate SQL strings.

Prevent:

SQL Injection
XSS
CSRF
SSRF
Path Traversal
Command Injection
Rate Limiting

Protect:

login
registration
password reset
MFA
messaging
search

Prevent abuse.

Logging

Never log:

passwords
tokens
secrets
cookies
personal sensitive data

Logs must be useful without leaking confidential information.

Privacy

Collect the minimum amount of data.

Never expose private information accidentally.

Respect user privacy by default.

Performance

Optimize only where measurable.

Avoid premature optimization.

However:

Never create obviously slow solutions.

Avoid:

unnecessary re-renders
N+1 queries
duplicate fetching
unnecessary allocations
unnecessary serialization

Prefer:

pagination
lazy loading
caching
indexing
memoization where appropriate
Memory

Never create memory leaks.

Always clean:

subscriptions
event listeners
intervals
observers
sockets
timers

Avoid retaining unnecessary references.

Next.js

Prefer Server Components.

Use Client Components only when required.

SSR:

Feed
Profiles
Search

CSR:

Messages
Theme Switching
Interactive UI
Database

Current database:

Supabase PostgreSQL

Schema must remain:

understandable
normalized
easy to extend

Never create tables for hypothetical future features.

Design for evolution without unnecessary complexity.

Design System

Never hardcode:

colors
spacing
typography
radius
shadows
transitions

Everything must come from centralized configuration.

Changing one configuration file should update the entire application.

UI Rules

No inline styles.

No duplicated components.

No inconsistent spacing.

No visual noise.

No unnecessary animations.

Always use skeletons instead of loading text.

Icons only.

Never use emoji inside the interface.

Preferred:

Lucide React

Alternative:

Tabler Icons
Localization

Never hardcode user-facing text.

Every string must be localized.

Support future language expansion without code duplication.

Naming

Names must immediately explain purpose.

Avoid abbreviations.

Prefer clarity over brevity.

Code should read like natural language.

Dependencies

Every dependency increases maintenance cost.

Before adding one, ask:

Can existing code solve this?
Can the standard library solve this?
Is the dependency actively maintained?
Is it truly necessary?

If not, do not install it.

Self-Review

Before finishing any task, verify:

Does this duplicate existing functionality?
Is there a simpler solution?
Is it secure?
Is it scalable?
Is it consistent?
Is it reusable?
Is it understandable?
Does it introduce technical debt?
Does it follow project architecture?
Would an experienced engineer approve this implementation?

If any answer is "No", revise the implementation before considering it complete.

Final Rule

The codebase must always remain elegant, predictable, secure and easy to extend.

Every change should make the project better than it was before.

Never optimize for generating more code.

Always optimize for writing better code.

Think like the long-term maintainer of a platform that will continue to grow for many years.