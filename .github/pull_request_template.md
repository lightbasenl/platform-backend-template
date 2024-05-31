**Description**

**Checklist**

Please check the following items before submitting the PR. Add relevant
explanations for these points above in the description.

- [ ] The PR title is in line with the following examples:
  - `chore(ci): add speedups to lint job`
  - `fix(user): always show the email in the profile drop down`
  - `feat(tags): add SVG symbols to the tag cards`
- [ ] The PR is implemented according to the Acceptance Criteria. Include a link
      to Jira or Sentry in the description.
- [ ] The PR includes appropriate
      [tests](https://www.notion.so/lightbase/End-to-end-testing-07267aec731943049cc06364aa0233b8).
- [ ] The PR does use a
      [feature flag](https://www.notion.so/lightbase/Feature-flags-dbeb321e2393422da410a9289f8392b6).
- [ ] The PR includes technical documentation in the appropriate places. Any
      additional detail should be provided in the description.
  - Route definitions including documented error keys.
  - Complex functions should have some documentation.
  - Unique scenario's should explain why this is a unique scenario.
  - Shortcuts are marked with a TODO comment.
  - Detected
    [technical debt](https://www.notion.so/Technical-debt-refactoring-eabbdee2b66945d7b55517f92cca20bb)
    is marked with a TODO comment.
  - Obsolete comments are removed.

<!-- Other information and points to manually check and if necessary, elaborate on in the description

Jira's links are automatically expanded. So you can write `[JIRA-123]`, which a Jira bot will automatically resolve into a valid url after you have updated a PR comment or description.
Sentry links can be easily copied from the Sentry Issue page by clicking the 'chevron-down' icon -> 'Copy markdown link'.

- The PR includes manual input validation when necessary
- The PR includes correct error handling of external services
- The PR does not add a new dependency. Follow
      [this document](https://www.notion.so/lightbase/Introducing-dependencies-ac169cfeafb44782bded308810237737)
      and add the link to in the description.
- The PR does not introduce a N+1 query.
- The PR does not include over-fetching via database queries.
- The PR does not include unrelated changes.
- The PR does not include `// eslint-disable` comments.
- The PR does not mix dependency updates and refactoring with features and
      fixes.
-->

[Reviewers guide](https://www.notion.so/lightbase/Pull-request-PR-reviews-Frontend-66f65f2fc91948a79d8f53a138e6f422)
