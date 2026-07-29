export interface IndexEntry {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly contest: string;
  readonly year?: number;
  readonly topics: readonly string[];
  readonly techniques: readonly string[];
  readonly engines: readonly string[];
  readonly difficulty: number;
  readonly slot: string;
  readonly kind: string;
  readonly steps: number;
  readonly hasBranching: boolean;
  readonly hasInvariants: boolean;
  readonly hasSandbox: boolean;
}
