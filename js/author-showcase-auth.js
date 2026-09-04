export const AUTHOR_AUTH_KEY = "jiwei_author_showcase_auth_v1";

/** 前端访问门槛，不用于保护服务器机密。 */
export function isAuthorPasswordValid(value) {
  return String(value || "") === "davidchen123";
}

export function hasAuthorShowcaseAccess(storage) {
  try {
    return storage.getItem(AUTHOR_AUTH_KEY) === "1";
  } catch (err) {
    return false;
  }
}

export function grantAuthorShowcaseAccess(storage) {
  try {
    storage.setItem(AUTHOR_AUTH_KEY, "1");
    return true;
  } catch (err) {
    return false;
  }
}
