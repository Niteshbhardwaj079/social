import { badRequest } from '../utils/httpError.js';

/**
 * Checks req.body / req.query / req.params against zod schemas and puts the cleaned values on
 * `req.valid`. Anything the schema does not list is dropped, so handlers only see known fields.
 */
export function validate({ body, query, params }) {
  return (req, _res, next) => {
    const valid = {};
    for (const [part, schema] of Object.entries({ body, query, params })) {
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
        throw badRequest(details[0]?.message || 'Invalid request', details);
      }
      valid[part] = result.data;
    }
    req.valid = valid;
    next();
  };
}
