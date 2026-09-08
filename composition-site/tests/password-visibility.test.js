const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPasswordVisibilityController } = require('../password-visibility.js');

function button() {
  const attributes = new Map();
  return {
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: name => attributes.get(name)
  };
}

test('password visibility controller reveals and conceals without retaining the password', () => {
  const input = { type: 'password' };
  const toggle = button();
  const controller = createPasswordVisibilityController({ input, button: toggle });

  controller.toggle();
  assert.equal(input.type, 'text');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.getAttribute('aria-label'), '隐藏密码');

  controller.reset();
  assert.equal(input.type, 'password');
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(toggle.getAttribute('aria-label'), '显示密码');
  assert.equal(Object.hasOwn(input, 'value'), false);
});

test('password visibility script is publicly loadable before the login page initializes', () => {
  const security = fs.readFileSync(path.join(__dirname, '..', 'server', 'src', 'main', 'java', 'site', 'fanwenjia', 'config', 'SecurityConfig.java'), 'utf8');
  assert.match(security, /"\/password-visibility\.js"/);
});
