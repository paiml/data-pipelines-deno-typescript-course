/**
 * Result type for functional error handling
 * Represents either a successful value or an error
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Helper functions for Result type
 */
export const Result = {
  ok<T, E = Error>(value: T): Result<T, E> {
    return { success: true, value };
  },

  err<T, E = Error>(error: E): Result<T, E> {
    return { success: false, error };
  },

  isOk<T, E>(result: Result<T, E>): result is { success: true; value: T } {
    return result.success;
  },

  isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
    return !result.success;
  },

  map<T, U, E>(
    result: Result<T, E>,
    fn: (value: T) => U,
  ): Result<U, E> {
    if (result.success) {
      return Result.ok(fn(result.value));
    }
    return result;
  },

  mapErr<T, E, F>(
    result: Result<T, E>,
    fn: (error: E) => F,
  ): Result<T, F> {
    if (!result.success) {
      return Result.err(fn(result.error));
    }
    return result as Result<T, F>;
  },

  async fromPromise<T, E = Error>(
    promise: Promise<T>,
    errorHandler?: (error: unknown) => E,
  ): Promise<Result<T, E>> {
    try {
      const value = await promise;
      return Result.ok(value);
    } catch (error) {
      const err = errorHandler ? errorHandler(error) : error as E;
      return Result.err(err);
    }
  },
};