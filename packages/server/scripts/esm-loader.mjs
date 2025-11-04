export async function resolve(specifier, context, defaultResolve) {
  const tryResolve = async (candidate) => defaultResolve(candidate, context, defaultResolve);
  try {
    return await tryResolve(specifier);
  } catch (error) {
    if (!(specifier.startsWith('./') || specifier.startsWith('../')) || specifier.includes('?')) {
      throw error;
    }

    const tried = new Set();

    const attempt = async (candidate) => {
      if (tried.has(candidate)) {
        return null;
      }
      tried.add(candidate);
      try {
        return await tryResolve(candidate);
      } catch (_) {
        return null;
      }
    };

    const withJs = specifier.endsWith('.js') ? null : await attempt(`${specifier}.js`);
    if (withJs) return withJs;

    const withIndexJs = await attempt(`${specifier}/index.js`);
    if (withIndexJs) return withIndexJs;

    throw error;
  }
}
