/**
 * Checks the shape of an API response before it is mapped into `core` types.
 * Every error names the endpoint and the field, so the log says exactly what the source sent wrong.
 */

export class ResponseShapeError extends Error {
  constructor(endpoint: string, problem: string) {
    super(`WindIQ ${endpoint}: ${problem}`);
    this.name = "ResponseShapeError";
  }
}

/** Reads typed fields from an untrusted object, or throws a `ResponseShapeError`. */
export class ShapeReader {
  private constructor(
    private readonly endpoint: string,
    private readonly value: Record<string, unknown>,
    private readonly prefix: string,
  ) {}

  static of(endpoint: string, body: unknown, prefix = ""): ShapeReader {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ResponseShapeError(endpoint, "expected an object");
    }
    return new ShapeReader(endpoint, body as Record<string, unknown>, prefix);
  }

  private fail(key: string, expected: string): never {
    throw new ResponseShapeError(this.endpoint, `${this.prefix}${key} must be ${expected}`);
  }

  string(key: string): string {
    const v = this.value[key];
    return typeof v === "string" && v.length > 0 ? v : this.fail(key, "a non-empty string");
  }

  number(key: string): number {
    const v = this.value[key];
    return typeof v === "number" && Number.isFinite(v) ? v : this.fail(key, "a number");
  }

  integer(key: string): number {
    const v = this.number(key);
    return Number.isInteger(v) ? v : this.fail(key, "a whole number");
  }

  positive(key: string): number {
    const v = this.number(key);
    return v > 0 ? v : this.fail(key, "greater than 0");
  }

  /** A share such as a loss or an uncertainty: 0.03 = 3 %. Catches values sent in percent. */
  share(key: string): number {
    const v = this.number(key);
    return v >= 0 && v < 1 ? v : this.fail(key, "a share between 0 and 1");
  }

  object(key: string): ShapeReader {
    const v = this.value[key];
    if (typeof v !== "object" || v === null || Array.isArray(v)) this.fail(key, "an object");
    return ShapeReader.of(this.endpoint, v, `${this.prefix}${key}.`);
  }

  nonEmptyList(key: string): ShapeReader[] {
    const v = this.value[key];
    if (!Array.isArray(v) || v.length === 0) this.fail(key, "a non-empty list");
    return v.map((item, i) => {
      if (typeof item !== "object" || item === null) this.fail(`${key}[${i}]`, "an object");
      return ShapeReader.of(this.endpoint, item, `${this.prefix}${key}[${i}].`);
    });
  }
}
