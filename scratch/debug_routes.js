const app = require('../src/app');

function printRoutes(stack, prefix = '') {
  if (!stack) return;
  stack.forEach((layer) => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
      console.log(`${methods} ${prefix}${layer.route.path}`);
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const newPrefix = prefix + (layer.regexp.source
        .replace('^\\', '')
        .replace('\\/?(?=\\/|$)', '')
        .replace('\\/', '/')
        .replace('(?:/(?=$))?', '')
        .replace('\\?', '')
        .replace('(?=/|$)', '')
        .replace('\\/', '/') || '');
      printRoutes(layer.handle.stack, newPrefix);
    }
  });
}

// In Express 4.x, the router is created on the first app.use() or similar.
// We can access it via app._router.stack
if (app._router) {
  printRoutes(app._router.stack);
} else {
  // If not yet created, we might need to trigger its creation
  app.lazyrouter();
  printRoutes(app._router.stack);
}


