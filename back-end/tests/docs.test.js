// Tests for the API documentation: Swagger UI at /api-docs, and the
// OpenAPI spec (openapi.yaml) it displays.
// Run with: npm test (from the back-end folder).
//
// These tests keep the documentation honest:
//   - the docs page and the raw spec are actually served
//   - the spec is valid OpenAPI, so Swagger UI and other tools can read it
//   - every endpoint the spec documents really exists in the app, so the
//     docs can never describe a route that isn't there
//   - every documented endpoint has a summary, a tag (its section in
//     Swagger UI) and a documented success response

// node:test is Node's built-in test runner.
import { describe, test, before, after } from 'node:test';
// assert/strict: checks such as assert.equal(actual, expected), matching exactly.
import assert from 'node:assert/strict';
// supertest sends HTTP requests straight to the app, without starting a server.
import request from 'supertest';
// swagger-parser checks a spec against the official OpenAPI rules.
import SwaggerParser from '@apidevtools/swagger-parser';

import app from '../app.js';
// pool: the database connection pool, closed at the end so Node can exit.
import pool from '../db/index.js';

// The HTTP methods an OpenAPI path can document. A path object can also
// hold other keys (such as shared `parameters`), so only these count.
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// The spec as served by the app, loaded once before the tests that need it.
let spec;

// before() runs once, before any test in this file.
before(async () => {
  const res = await request(app).get('/api-docs/openapi.json');
  spec = res.body;
});

// Close the database connections after the last test, or Node won't exit.
after(() => pool.end());

// Lists every documented operation as { method, path, operation }.
// Object.entries() turns an object into an array of [key, value] pairs, so
// this loops over each path, then over each HTTP method under that path.
const documentedOperations = () => {
  const operations = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) operations.push({ method, path, operation: pathItem[method] });
    }
  }
  return operations;
};

describe('API documentation', () => {
  test('serves Swagger UI at /api-docs/', async () => {
    const res = await request(app).get('/api-docs/');

    assert.equal(res.status, 200);
    // res.type is the response's content type, e.g. 'text/html'.
    assert.equal(res.type, 'text/html');
    // The page loads Swagger UI, whose page includes this element id.
    assert.match(res.text, /swagger-ui/);
  });

  test('serves the raw OpenAPI spec as JSON at /api-docs/openapi.json', async () => {
    const res = await request(app).get('/api-docs/openapi.json');

    assert.equal(res.status, 200);
    assert.equal(res.type, 'application/json');
    // OpenAPI 3.0.x: the version Swagger UI and most other tools support best.
    assert.match(res.body.openapi, /^3\.0\.\d+$/);
    assert.equal(typeof res.body.info.title, 'string');
  });

  test('the spec is valid OpenAPI', async () => {
    // validate() throws (failing this test) with a description of the first
    // rule the spec breaks, e.g. a missing required field or a broken $ref.
    // structuredClone() passes a copy, because the validator modifies the
    // object it's given.
    await SwaggerParser.validate(structuredClone(spec));
  });

  test('documents at least one endpoint', () => {
    // Guards the tests below: with no endpoints, their loops would check
    // nothing and pass without proving anything.
    assert.ok(documentedOperations().length > 0);
  });

  test('every documented endpoint exists in the app', async () => {
    const operations = documentedOperations();
    // With nothing documented, the loop below would check nothing and pass.
    assert.ok(operations.length > 0, 'no endpoints are documented');

    for (const { method, path } of operations) {
      // Turn a documented path such as /products/{productId} into a real URL
      // by replacing each {placeholder} with 1. /\{[^}]+\}/g matches every
      // "{...}" in the path.
      const url = path.replace(/\{[^}]+\}/g, '1');

      // Send the request with no login and no body. Whatever the app replies
      // (200, 400, 401, or its own JSON 404 such as "Product not found"),
      // that proves a route exists. A route that DOESN'T exist gets Express's
      // built-in 404, which is an HTML page, not the app's JSON error.
      // request(app)[method](url) is the same as e.g. request(app).get(url),
      // with the method chosen by the variable.
      const res = await request(app)[method](url);

      const isExpressNotFound = res.status === 404 && typeof res.body.error !== 'string';
      // The third argument is the message shown if the check fails, naming
      // the route that's documented but missing.
      assert.equal(isExpressNotFound, false, `${method.toUpperCase()} ${path} is documented but doesn't exist`);
    }
  });

  test('every documented endpoint has a summary, a tag and a success response', () => {
    const operations = documentedOperations();
    // With nothing documented, the loop below would check nothing and pass.
    assert.ok(operations.length > 0, 'no endpoints are documented');

    for (const { method, path, operation } of operations) {
      const name = `${method.toUpperCase()} ${path}`;

      assert.equal(typeof operation.summary, 'string', `${name} needs a summary`);
      // Tags group endpoints into sections in Swagger UI, e.g. "Cart".
      assert.ok(operation.tags?.length > 0, `${name} needs a tag`);
      // At least one documented response code starting with 2 (200, 201, 204).
      // Object.keys() gives the response codes, e.g. ['200', '401'].
      const successCodes = Object.keys(operation.responses ?? {}).filter((code) => code.startsWith('2'));
      assert.ok(successCodes.length > 0, `${name} needs a documented success response`);
    }
  });
});
