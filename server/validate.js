import { isValidISODate } from './dates.js';

export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const FREQUENCIES = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'yearly', 'once'];
const MAX_CENTS = 100_000_000_000; // $1B — guards against fat-finger / overflow input

/**
 * Validate `input` against a field spec and return a clean object containing only known fields.
 * spec: { field: { type, required, nullable, min, max, values } }
 * `partial` = true for updates: missing fields are skipped instead of required.
 */
export function validate(input, spec, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Request body must be an object');
  const out = {};
  const errors = {};
  for (const [key, rule] of Object.entries(spec)) {
    let v = input[key];
    if (v === undefined) {
      if (!partial && rule.required) errors[key] = 'Required';
      else if (!partial && rule.default !== undefined) out[key] = rule.default;
      continue;
    }
    if (v === null || v === '') {
      if (rule.required && !rule.nullable) errors[key] = 'Required';
      else out[key] = null;
      continue;
    }
    switch (rule.type) {
      case 'string': {
        if (typeof v !== 'string') { errors[key] = 'Must be text'; break; }
        v = v.trim();
        if (rule.required && !v) { errors[key] = 'Required'; break; }
        if (v.length > (rule.max ?? 200)) { errors[key] = `Must be ${rule.max ?? 200} characters or fewer`; break; }
        out[key] = v;
        break;
      }
      case 'cents': {
        if (!Number.isInteger(v)) { errors[key] = 'Must be a whole number of cents'; break; }
        const min = rule.min ?? 0;
        if (v < min) { errors[key] = min > 0 ? 'Must be greater than zero' : 'Cannot be negative'; break; }
        if (Math.abs(v) > MAX_CENTS) { errors[key] = 'Amount is too large'; break; }
        out[key] = v;
        break;
      }
      case 'signedCents': {
        if (!Number.isInteger(v) || v === 0) { errors[key] = 'Must be a non-zero whole number of cents'; break; }
        if (Math.abs(v) > MAX_CENTS) { errors[key] = 'Amount is too large'; break; }
        out[key] = v;
        break;
      }
      case 'int': {
        if (!Number.isInteger(v) || (rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
          errors[key] = `Must be a whole number${rule.min !== undefined ? ` between ${rule.min} and ${rule.max}` : ''}`;
          break;
        }
        out[key] = v;
        break;
      }
      case 'number': {
        if (typeof v !== 'number' || !Number.isFinite(v) || (rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
          errors[key] = `Must be a number between ${rule.min} and ${rule.max}`;
          break;
        }
        out[key] = v;
        break;
      }
      case 'bool':
        out[key] = v === true || v === 1 ? 1 : 0;
        break;
      case 'date':
        if (!isValidISODate(v)) errors[key] = 'Must be a valid date (YYYY-MM-DD)';
        else out[key] = v;
        break;
      case 'month':
        if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) errors[key] = 'Must be a month (YYYY-MM)';
        else out[key] = v;
        break;
      case 'time':
        if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) errors[key] = 'Must be a time (HH:MM)';
        else out[key] = v;
        break;
      case 'enum':
        if (!rule.values.includes(v)) errors[key] = `Must be one of: ${rule.values.join(', ')}`;
        else out[key] = v;
        break;
      case 'ref':
        if (!Number.isInteger(v) || v <= 0) errors[key] = 'Invalid reference';
        else out[key] = v;
        break;
      case 'color':
        if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) errors[key] = 'Must be a hex color';
        else out[key] = v;
        break;
      default:
        throw new Error(`Unknown rule type ${rule.type}`);
    }
  }
  if (Object.keys(errors).length) {
    const first = Object.entries(errors)[0];
    throw new HttpError(400, `${first[0]}: ${first[1]}`, errors);
  }
  return out;
}
