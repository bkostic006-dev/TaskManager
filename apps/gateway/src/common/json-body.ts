/**
 * Ceiling on the JSON body `express.json()` will read, stated rather than
 * inherited from the parser's 100 KB default.
 *
 * The default is not a size anybody chose for this API: every body the gateway
 * accepts today is a signup or a login, a few hundred bytes bounded by the
 * DTOs' own `@MaxLength` rules. A bound this far above them costs nothing and
 * means the parser buffers 32 KB of an unwanted upload instead of 100 KB before
 * refusing it — the difference matters only in aggregate, which is exactly the
 * case a body-size limit exists for.
 *
 * It is a shared constant because the e2e suite has to restate the parser
 * (a body parser is an adapter option, not a module provider) and a suite
 * testing a different limit from the one that ships proves nothing.
 */
export const JSON_BODY_LIMIT = '32kb';
