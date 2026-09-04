import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTHOR_AUTH_KEY,
  isAuthorPasswordValid,
  hasAuthorShowcaseAccess,
  grantAuthorShowcaseAccess,
} from "./author-showcase-auth.js";

test("author password accepts only the configured value", () => {
  assert.equal(isAuthorPasswordValid("davidchen123"), true);
  assert.equal(isAuthorPasswordValid("Davidchen123"), false);
  assert.equal(isAuthorPasswordValid("davidchen12"), false);
  assert.equal(isAuthorPasswordValid(""), false);
});

test("author access persists only in the supplied session storage", () => {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
  assert.equal(hasAuthorShowcaseAccess(storage), false);
  assert.equal(grantAuthorShowcaseAccess(storage), true);
  assert.equal(values.get(AUTHOR_AUTH_KEY), "1");
  assert.equal(hasAuthorShowcaseAccess(storage), true);
});
