import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { EmailTemplateCreate } from "@/src/features/email-templates/schemas/email-template-schema"

interface NewTemplateState {
  formData: EmailTemplateCreate
}

interface NewTemplateActions {
  setFormData: (data: Partial<EmailTemplateCreate>) => void
  reset: () => void
}

type NewTemplateStore = NewTemplateState & NewTemplateActions

const DEFAULT_FORM_DATA: EmailTemplateCreate = {
  name: "",
  subject: "",
  html_content: "",
  text_content: "",
  description: "",
  is_active: true,
  category: "transactional",
}

export const useNewTemplateStore = create<NewTemplateStore>()(
  persist(
    (set) => ({
      formData: { ...DEFAULT_FORM_DATA },

      setFormData: (data) =>
        set((state) => ({
          formData: { ...state.formData, ...data },
        })),

      reset: () =>
        set({
          formData: { ...DEFAULT_FORM_DATA },
        }),
    }),
    {
      name: "digitopub-new-email-template",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
