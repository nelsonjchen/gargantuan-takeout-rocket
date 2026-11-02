export interface Download {
  owner?: "service";
  name: string;
  status: "failed" | "complete" | "pending";
  reason?: string;
  size?: number;
  phase?:
    | "delegated"
    | "queued"
    | "waiting"
    | "inspecting"
    | "copying"
    | "committing";
  startedAt?: number;
  updatedAt?: number;
  transferredBytes?: number;
  totalBytes?: number;
  completedBlocks?: number;
  totalBlocks?: number;
}
