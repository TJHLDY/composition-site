(function exposePasswordVisibility(root, factory) {
  const passwordVisibility = factory();
  if (typeof module === 'object' && module.exports) module.exports = passwordVisibility;
  if (root) root.PasswordVisibility = passwordVisibility;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPasswordVisibilityModule() {
  'use strict';

  function createPasswordVisibilityController({ input, button }) {
    let visible = false;
    function render() {
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? '隐藏密码' : '显示密码');
    }
    render();
    return {
      toggle() { visible = !visible; render(); },
      reset() { visible = false; render(); }
    };
  }

  return { createPasswordVisibilityController };
});
