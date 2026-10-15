/** A failure the user or agent can act on: `fly` prints its message and exits 1, without a stack. */
export class UserError extends Error {}

/** The transport has no login to the reMarkable cloud, or its login has expired. */
export class NotLoggedInError extends Error {}
