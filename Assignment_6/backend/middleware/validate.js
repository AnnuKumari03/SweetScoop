// AJV JSON Schema validation middleware (Checklist #10)
const Ajv = require('ajv');
const { AppError } = require('./errorHandler');

const ajv = new Ajv({ allErrors: true, removeAdditional: true, useDefaults: true });

// Register common formats without extra dependencies
ajv.addFormat('email', {
  type: 'string',
  validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
});

function validate(schema) {
  const validate = ajv.compile(schema);
  return (req, res, next) => {
    const valid = validate(req.body || {});
    if (!valid) {
      const errors = validate.errors.map(e => ({
        field: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || 'body',
        message: e.message
      }));
      return next(new AppError(422, 'Validation Failed', 'The request body failed schema validation.', { errors }));
    }
    next();
  };
}

module.exports = { validate, ajv };
