export interface Download {
  name: string;
  status: "failed" | "complete" | "pending";
  reason?: string;
  size?: number;
}
