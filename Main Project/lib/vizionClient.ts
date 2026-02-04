// Lightweight Vizion client shim for the browser.
// This expects a global Vizion runner to be available (e.g. injected by a script
// that provides a `vizon` or `Vizion` object with a `run(params, data)` function).

export async function runVizion(params: any, data: any[]): Promise<any> {
  const win = window as any
  // Try common global names
  const runner = win?.vizon?.run || win?.Vizion?.run || win?.vizon || win?.Vizion
  if (!runner) {
    throw new Error('Vizion runtime not available in the browser. Ensure Vizion is exposed as a global with a run(params, data) function.')
  }

  // If runner is an object with run method
  if (typeof runner === 'object' && typeof runner.run === 'function') {
    return await runner.run(params, data)
  }

  // If runner is a function itself
  if (typeof runner === 'function') {
    return await runner(params, data)
  }

  throw new Error('Vizion runner not callable')
}

export default runVizion
