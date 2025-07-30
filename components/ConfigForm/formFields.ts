import { AppActionsSchema } from "@/system/actions"
import { ModuleResultType } from 'wolfy-module-kit'
import { type FormFieldConfig } from '@/components/ConfigForm/ConfigForm'

export const FORM_FIELDS: FormFieldConfig[] = [
  {
    key: "resultAction",
    label: "Module Result Action",
    type: "select",
    options: [AppActionsSchema.enum.Done, AppActionsSchema.enum.CustomAction],
    required: true,
  },
  {
    key: 'expectedResultType',
    label: 'Expected Result Type',
    type: 'select',
    options: Object.values(ModuleResultType) as string[],
    required: true,
  },
]