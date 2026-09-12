export const MAX_BEHAVIOR_INSTRUCTIONS_LENGTH = 12_000;

export interface BehaviorVersion {
  id: number;
  instructions: string;
  createdAt: string;
  restoredFrom?: number;
}

export interface BehaviorSnapshot {
  revision: number;
  active: BehaviorVersion;
  draft: { instructions: string } | null;
  versions: BehaviorVersion[];
  source: "saved" | "built_in";
}
