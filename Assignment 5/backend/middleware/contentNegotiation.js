// Content negotiation middleware — JSON vs XML (Checklist #11)
const { AppError, jsonToXml } = require('./errorHandler');

function contentNegotiation(req, res, next) {
  const accept = req.headers.accept || 'application/json';
  const supports = ['application/json', 'application/xml', '*/*'];
  const acceptsXml = accept.includes('application/xml');
  const acceptsJson = accept.includes('application/json') || accept.includes('*/*');

  if (!acceptsXml && !acceptsJson) {
    return next(new AppError(406, 'Not Acceptable', 'Only application/json and application/xml are supported.'));
  }

  // Monkey-patch res.json to also handle XML
  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (acceptsXml && !acceptsJson) {
      res.setHeader('Content-Type', 'application/xml');
      const xml = jsonToXml(body);
      return res.send(xml);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return origJson(body);
  };
  next();
}

module.exports = { contentNegotiation };
