// =================================================================
// Bootstrap
// =================================================================

window.addEventListener('DOMContentLoaded', () => {
  morphState.t = 1; // start fully spherical, matches "Planet (3D)" default
  init();
  initClickToToggle();
  loadCountries();
});
