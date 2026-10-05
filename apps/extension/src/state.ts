export interface Download {
  name: string;
  status: "failed" | "complete" | "pending";
  reason?: string;
  size?: number;
  phase?: "inspecting" | "copying" | "committing";
  startedAt?: number;
  updatedAt?: number;
  transferredBytes?: number;
  totalBytes?: number;
  completedBlocks?: number;
  totalBlocks?: number;
}
