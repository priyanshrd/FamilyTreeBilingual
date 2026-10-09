// The id of the change currently being saved; sent as the x-operation-id header (see undo.ts).
let current: string | null = null;

export const operationContext = {
  get: (): string | null => current,
  set: (id: string | null) => {
    current = id;
  },
};
