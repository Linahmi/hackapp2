import { create } from "zustand"

type ProcurementStatus = "idle" | "searching" | "awaiting-selection" | "analyzing" | "generating" | "complete"

type ProcurementStore = {
  step: number
  stepLabel: string
  status: ProcurementStatus
  suppliersFound: number | null
  setStep: (step: number, label: string) => void
  setStatus: (status: ProcurementStatus) => void
  setSuppliersFound: (n: number | null) => void
  reset: () => void
}

const initial = {
  step: 0,
  stepLabel: "Analysis",
  status: "idle" as ProcurementStatus,
  suppliersFound: null,
}

export const useProcurementStore = create<ProcurementStore>((set) => ({
  ...initial,
  setStep: (step, label) => set({ step, stepLabel: label }),
  setStatus: (status) => set({ status }),
  setSuppliersFound: (suppliersFound) => set({ suppliersFound }),
  reset: () => set(initial),
}))
