/**
 * Extract the option list from a combo input definition.
 *
 * Supports both shapes returned by /object_info:
 *   - legacy: [[ "a", "b" ], { ... }]        (list as the first element)
 *   - new:    [ "COMBO", { "options": [...] } ]  (io.Combo.Input)
 *
 * Kept in its own module so widgets (Dropdown, AspectRatioSelector, …) can
 * reuse it without pulling in the whole dropdown handler.
 */
export function extractComboOptions(inputData) {
  if (!Array.isArray(inputData)) return null;

  // Legacy form: the first element is the options array.
  if (Array.isArray(inputData[0])) return inputData[0];

  // New form: ["COMBO", { options: [...] }]
  if (inputData[0] === 'COMBO') {
    const options = inputData[1] && inputData[1].options;
    if (Array.isArray(options)) return options;
  }

  // Fallback: a bare list of options.
  if (
    inputData.length &&
    inputData.every((item) => typeof item === 'string' || typeof item === 'number')
  ) {
    return inputData;
  }

  return null;
}

export default extractComboOptions;
