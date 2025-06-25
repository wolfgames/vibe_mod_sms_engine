enum ModuleResultType {
  Attempt = "attempt",
  Choice = "choice",
}

/**
 *
 * @param {ModuleConfiguration} configuration
 * @param {ModuleResult} result
 */
export const resultInterpretation = (
  configuration: any, // temporary any types
  result: any,
): Array<string> => {
  if (result.type === ModuleResultType.Attempt) {
    return [configuration.resultAction];
  } else if (result.type === ModuleResultType.Choice) {
    return [configuration.resultAction];
  }

  throw new Error(`Unexpected result type ${result.type}. Valid module execution result types: ["${Object.values(ModuleResultType).join('","')}"]`);
};
