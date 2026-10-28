export class NotFoundError extends Error {}
export class ServiceUnavailableError extends Error {}
/** 400 for a request that is well-formed JSON but cannot be honoured (e.g. an OAuth state mismatch). */
export class BadRequestError extends Error {}
/** 401: nobody is signed in (no valid session cookie or bearer token). */
export class UnauthorizedError extends Error {}
/** 403: signed in, but not allowed — e.g. not the project's owner. */
export class ForbiddenError extends Error {}
