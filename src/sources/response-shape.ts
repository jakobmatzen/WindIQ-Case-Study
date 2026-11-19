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

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** Reads typed fields from an untrusted object, or throws a `ResponseShapeError`. */
export class ShapeReader {
  private constructor(
    private readonly endpoint: string,
    private readonly value: Record<string, unknown>,
    private readonly prefix: string,
  ) {}

  static of(endpoint: string, body: unknown, prefix = ""): ShapeReader {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      // A nested value names its position, e.g. "data[0] must be an object".
      const problem = prefix ? `${prefix.slice(0, -1)} must be an object` : "expected an object";
      throw new ResponseShapeError(endpoint, problem);
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

  /** Text or null; an empty string is not accepted. */
  nullableString(key: string): string | null {
    const v = this.value[key];
    if (v === null) return null;
    return typeof v === "string" && v.length > 0 ? v : this.fail(key, "a non-empty string or null");
  }

  /**
   * An ISO 8601 date and time with a time zone (`Z` or `±hh:mm`), returned as sent.
   * Without a zone the UTC hour would depend on the server's time zone.
   */
  dateTime(key: string): string {
    const v = this.value[key];
    return typeof v === "string" && ISO_DATE_TIME.test(v) && !Number.isNaN(Date.parse(v))
      ? v
      : this.fail(key, "a date and time");
  }

  number(key: string): number {
    const v = this.value[key];
    return typeof v === "number" && Number.isFinite(v) ? v : this.fail(key, "a number");
  }

  /** The raw value, unchecked: for fields whose content `core` judges. */
  raw(key: string): unknown {
    return this.value[key];
  }

  integer(key: string): number {
    const v = this.number(key);
    return Number.isInteger(v) ? v : this.fail(key, "a whole number");
  }

  nonNegative(key: string): number {
    const v = this.number(key);
    return v >= 0 ? v : this.fail(key, "0 or more");
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
    // `of` names the position on failure: "<key> must be an object".
    return ShapeReader.of(this.endpoint, this.value[key], `${this.prefix}${key}.`);
  }

  nonEmptyList(key: string): ShapeReader[] {
    const v = this.value[key];
    if (!Array.isArray(v) || v.length === 0) this.fail(key, "a non-empty list");
    return v.map((item, i) => ShapeReader.of(this.endpoint, item, `${this.prefix}${key}[${i}].`));
  }
}
