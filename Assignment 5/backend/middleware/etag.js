// ETag & Conditional Request middleware (Checklist #7)
const crypto = require('crypto');

function computeETag(obj) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
  return `W/"${hash}"`;
}

function etag(req, res, next) {
  const origJson = res.json.bind(res);
  res.json = (body) => {
    const etag = computeETag(body);
    res.setHeader('ETag', etag);

    // If-None-Match -> 304
    if (req.method === 'GET' || req.method === 'HEAD') {
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        res.status(304).end();
        return;
      }
    }

    // If-Match -> 412 (for PUT/PATCH)
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const ifMatch = req.headers['if-match'];
      if (ifMatch && ifMatch !== etag) {
        res.status(412).json({
          type: 'https://sweetscoop.example.com/errors/precondition-failed',
          title: 'Precondition Failed',
          status: 412,
          detail: 'The resource has been modified since the provided ETag.',
          instance: req.originalUrl
        });
        return;
      }
    }

    return origJson(body);
  };
  next();
}

module.exports = { etag, computeETag };
