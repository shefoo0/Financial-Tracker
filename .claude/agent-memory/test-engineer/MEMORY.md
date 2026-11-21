# test-engineer memory

Lessons from earlier apps, one line each. Newest at the bottom.

- RNTL v14: render and fireEvent are async, always await them (else "overlapping act" and findBy timeouts). Jest cannot import `@/global.css` (jest.mock it or add a moduleNameMapper); mock expo-router incl. useFocusEffect/useNavigation. Helpers outside `__tests__/` (e.g. `test-support/`) so Jest does not treat them as tests.
