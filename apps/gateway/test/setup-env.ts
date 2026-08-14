// CoreModule reads JWT_SECRET with `getOrThrow`, so nothing that imports it can
// be constructed without one. Supplying it here keeps that strictness in the
// production path instead of softening it for the suite's sake.
process.env.JWT_SECRET ??= 'test-only-signing-key';
