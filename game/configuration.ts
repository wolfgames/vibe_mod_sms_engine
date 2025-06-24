import { z } from 'zod';
import { action, baseConfig } from './types';

export const moduleConfiguration = z.object({
  resultAction: action,
});

const fullConfig = moduleConfiguration.and(baseConfig);

export type ModuleConfiguration = z.TypeOf<typeof fullConfig>;
