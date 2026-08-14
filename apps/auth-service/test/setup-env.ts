// The app reads JWT_SECRET with `getOrThrow`, so a module that includes
// AuthModule cannot be constructed without one. Supplying it here keeps that
// strictness in production code instead of softening it for the suite's sake.
process.env.JWT_SECRET ??= 'test-only-signing-key';
