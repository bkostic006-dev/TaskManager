// CoreModule reads JWT_SECRET with `getOrThrow`, so nothing that imports it can
// be constructed without one. Supplying it here keeps that strictness in the
// production path instead of softening it for the suite's sake.
process.env.JWT_SECRET ??= 'test-only-signing-key';

// Same reasoning for the two variables the gateway now refuses to boot without.
// A default in the app is a deployment silently allowing credentialed CORS from
// somewhere nobody chose, or setting the refresh cookie without `Secure`; a
// default here is just a test fixture.
process.env.WEB_ORIGIN ??= 'http://localhost:3000';
process.env.COOKIE_SECURE ??= 'false';

// The two upstream base URLs, for the same reason. They used to carry `??`
// defaults in the clients themselves — the only config in the gateway that did
// — so a missing variable booted a gateway pointed at nothing and turned every
// request into a `503`. Nothing in the suite dials these; they exist so the
// clients can be constructed at all.
process.env.AUTH_SERVICE_URL ??= 'http://localhost:4001';
process.env.TASK_SERVICE_URL ??= 'http://localhost:4002';
