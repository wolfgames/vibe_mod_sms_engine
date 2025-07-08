import type { ModuleConfig } from "./configuration"
import type { AppActions } from './actions'
import { ModuleResultType, ModuleResult, BaseActions } from 'module-kit'

// region Frozen
export interface BaseModuleResult {
  type: ModuleResultType
  data?: any
}

export interface CustomModuleResult extends ModuleResult {
  actions: AppActions[]
}
// endregion Frozen

/**
 * Result interpretation function
 * Processes the module result and determines what actions should be taken
 */
export function interpretResult(
  config: ModuleConfig,
  result: BaseModuleResult,
): CustomModuleResult {
  return {
    type: result.type,
    data: result.data,
    actions: [BaseActions.Done],
  };
};
